/**
	Check Mate service client.

	Owns the pending-op log: every user intent is snapshotted here, persisted, and
	drained to the server one op at a time. The view layer reads getPendingOps()
	and replays it over the last known server state, so an in-flight refresh can
	never overwrite an edit that hasn't been sent yet.
*/
enyo.kind({
	name: "checkmate.api",
	notation: null,
	grandmaster: null,
	maxRetries: 3,
	//Requests hang forever without this. A wedged POST used to leave the queue
	//	permanently marked as processing, which stopped the app syncing until it
	//	was relaunched. enyo.Async#fail cancels the underlying XHR, so a timeout
	//	is a real abort and the response can't turn up later.
	requestTimeout: 20000,
	//Queued ops are held this long before being sent, so a delete can be undone
	//	by removing the op rather than by racing a setTimeout against a refresh.
	deleteHoldMs: 3000,
	storageKey: "pendingOps",
	onPostSuccess: function() {},
	onPostError: function() {},
	onRefreshSuccess: function() {},
	onRefreshError: function() {},
	onQueueChanged: function() {},
	create: function() {
		this.inherited(arguments);
		//Instance state, NOT kind properties: a non-function property in a kind
		//	definition lives on the prototype and is shared by every instance.
		this.updateQueue = [];
		this.deadLetters = [];
		this.queueProcessing = false;
		this.queueRetryCount = 0;
		this.opCounter = 0;
		//Only the newest refresh may apply its response. Anything older lost the
		//	race and its data is, by definition, staler than what we already have.
		this.refreshSeq = 0;
		this.activeRefreshSeq = 0;
		this.restoreQueue();
	},
	published: {
		urlBase: "checkmate.wosa.link",
		insecure: false,
		useCustomServer: false,
		customServer:""
	},
	buildURL: function(actionType) {
		var urlBase = this.getUrlBase();
		if (this.getUseCustomServer() == true && this.getCustomServer() != "") {
			urlBase = this.getCustomServer();
		}
		if (urlBase.indexOf("http://") == -1 && urlBase.indexOf("https://") == -1) {
			urlBase = "https://" + urlBase;
		}
		if (this.getInsecure() == true) {
			enyo.warn("Warning, using insecure URL base due to setting.");
			urlBase = urlBase.replace("https://", "http://");
		} else {
			urlBase = urlBase.replace("http://", "https://");
		}
		//Make sure we don't end up with double slashes in the built URL if there's a custom endpoint
		var urlTest = urlBase.split("://");
		if (urlTest[urlTest.length - 1].indexOf("/") != -1) {
			urlBase = urlBase.substring(0, urlBase.length - 1);
		}
		return urlBase + "/" + actionType + ".php";
	},

	/* ---- Op log ---------------------------------------------------------- */

	//Deep copy of a plain task record. The queue must never hold a reference into
	//	the view's data, or a refresh landing between enqueue and send rewrites the
	//	payload and we post something the user never asked for.
	cloneTask: function(task) {
		var copy = {};
		for (var key in task) {
			if (task.hasOwnProperty(key)) {
				copy[key] = task[key];
			}
		}
		return copy;
	},
	newOpId: function() {
		this.opCounter++;
		return "op-" + this.opCounter + "-" + new Date().getTime();
	},
	//Queue an intent. `holdMs` delays sending (used by delete, so the undo window
	//	is "remove the op" instead of a timer racing the refresh loop).
	queueOp: function(taskData, opType, holdMs) {
		if (!taskData) {
			enyo.warn("queueOp called with null/undefined taskData");
			return null;
		}
		var op = {
			id: this.newOpId(),
			type: opType || "update",
			guid: taskData.guid,
			task: this.cloneTask(taskData),
			sendAfter: new Date().getTime() + (holdMs || 0)
		};
		//A newer intent for the same task supersedes any op still waiting to go
		//	out. Two toggles collapse to the final state, and a delete wins over
		//	edits queued before it. Only unsent ops are eligible.
		if (op.guid) {
			for (var i = this.updateQueue.length - 1; i >= 0; i--) {
				var queued = this.updateQueue[i];
				if (queued.guid === op.guid && !queued.inFlight) {
					this.updateQueue.splice(i, 1);
				}
			}
		}
		this.updateQueue.push(op);
		this.persistQueue();
		enyo.log("Queued " + op.type + " for " + op.guid + ", queue length now: " + this.updateQueue.length);
		this.onQueueChanged();
		return op;
	},
	//Queue a batch that must be applied together, e.g. a reorder. Sent as a JSON
	//	array, which the service applies in one read-modify-write.
	queueBatch: function(taskList) {
		if (!taskList || !taskList.length) {
			return null;
		}
		var tasks = [];
		for (var i = 0; i < taskList.length; i++) {
			tasks.push(this.cloneTask(taskList[i]));
		}
		var op = {
			id: this.newOpId(),
			type: "reorder",
			guid: null,
			task: tasks,
			sendAfter: new Date().getTime()
		};
		this.updateQueue.push(op);
		this.persistQueue();
		this.onQueueChanged();
		return op;
	},
	//Undo: drop an op that hasn't gone out yet. Returns true if it was still
	//	cancellable.
	cancelOp: function(opId) {
		for (var i = 0; i < this.updateQueue.length; i++) {
			if (this.updateQueue[i].id === opId && !this.updateQueue[i].inFlight) {
				this.updateQueue.splice(i, 1);
				this.persistQueue();
				this.onQueueChanged();
				return true;
			}
		}
		return false;
	},
	getPendingOps: function() {
		return this.updateQueue;
	},
	hasPendingOps: function() {
		return this.updateQueue.length > 0;
	},
	//Ops still inside their hold window, which the view renders as "deleting".
	isOpHeld: function(op) {
		return !op.inFlight && op.sendAfter > new Date().getTime();
	},

	/* ---- Persistence ----------------------------------------------------- */

	//localStorage is already load-bearing for credentials, so it's proven on
	//	every target. Without this, an app kill loses every unsent edit silently.
	persistQueue: function() {
		try {
			var durable = [];
			for (var i = 0; i < this.updateQueue.length; i++) {
				var op = this.updateQueue[i];
				durable.push({
					id: op.id, type: op.type, guid: op.guid,
					task: op.task, sendAfter: op.sendAfter
				});
			}
			localStorage.setItem(this.storageKey, enyo.json.stringify(durable));
		} catch (err) {
			enyo.warn("Could not persist the update queue: " + err);
		}
	},
	restoreQueue: function() {
		try {
			var stored = localStorage.getItem(this.storageKey);
			if (!stored) {
				return;
			}
			var ops = enyo.json.parse(stored);
			if (!ops || !ops.length) {
				return;
			}
			for (var i = 0; i < ops.length; i++) {
				//Anything restored from a previous run is due immediately; its
				//	undo window expired when the app closed.
				ops[i].sendAfter = 0;
				ops[i].inFlight = false;
				this.updateQueue.push(ops[i]);
			}
			enyo.log("Restored " + ops.length + " pending op(s) from storage");
		} catch (err) {
			enyo.warn("Could not restore the update queue: " + err);
		}
	},

	/* ---- Draining -------------------------------------------------------- */

	updateTask: function(taskData) {
		this.queueOp(taskData, "update", 0);
		this.processQueue();
	},
	//Returns the op that is due to be sent, or null if the head is still being
	//	held. Held ops don't block the ones behind them.
	nextDueOp: function() {
		var now = new Date().getTime();
		for (var i = 0; i < this.updateQueue.length; i++) {
			if (this.updateQueue[i].sendAfter <= now) {
				return this.updateQueue[i];
			}
		}
		return null;
	},
	processQueue: function() {
		if (this.queueProcessing) {
			return;
		}
		var op = this.nextDueOp();
		if (op) {
			this.queueProcessing = true;
			op.inFlight = true;
			this.doUpdateTask(op);
		} else if (this.updateQueue.length === 0) {
			//Nothing outstanding, so a pull can't race one of our own pushes.
			this.getTasks();
		}
		//Otherwise every queued op is still inside its hold window; the caller's
		//	poll will come back for it.
	},
	removeOp: function(op) {
		for (var i = 0; i < this.updateQueue.length; i++) {
			if (this.updateQueue[i].id === op.id) {
				this.updateQueue.splice(i, 1);
				break;
			}
		}
		this.persistQueue();
		this.onQueueChanged();
	},
	doUpdateTask: function(op) {
		var useUrl = this.buildURL("update-notation") + "?move=" + this.notation;
		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: this.grandmaster},
			postBody: enyo.json.stringify(op.task),
			timeout: this.requestTimeout,
			cacheBust: true
		});
		request.error(enyo.bind(this, "processQueueError", op), this);
		request.response(enyo.bind(this, "processQueueSuccess", op), this);
		request.go();
	},
	processQueueSuccess: function(op, inSender, inResponse) {
		this.queueProcessing = false;
		this.queueRetryCount = 0;
		//The service answers 200 with an error body for some rejections. Treat
		//	that as a permanent failure rather than shifting the op off as if it
		//	had applied.
		if (!inResponse || !inResponse.tasks) {
			this.failOpPermanently(op, inResponse, "server returned no task list");
			return;
		}
		this.removeOp(op);
		this.onPostSuccess(inSender, inResponse, this.hasPendingOps());
	},
	//4xx means the request itself is wrong and will be wrong every time; retrying
	//	just burns the user's battery and then, in the old code, wiped the whole
	//	queue. 5xx, timeouts and transport errors are worth another go.
	isPermanentFailure: function(inSender) {
		var status = 0;
		if (inSender && inSender.xhrResponse && inSender.xhrResponse.status) {
			status = inSender.xhrResponse.status;
		}
		return status >= 400 && status < 500;
	},
	processQueueError: function(op, inSender, inValue) {
		this.queueProcessing = false;
		op.inFlight = false;

		if (this.isPermanentFailure(inSender)) {
			this.failOpPermanently(op, this.describeFailure(inSender, inValue), "rejected by the server");
			return;
		}

		//Count retries per op, not globally: a shared counter lets one flaky op
		//	burn the allowance that the next, unrelated op then gets judged by.
		op.retries = (op.retries || 0) + 1;
		this.queueRetryCount = op.retries;
		if (op.retries < this.maxRetries) {
			enyo.warn("Op failed, retrying (" + op.retries + "/" + this.maxRetries + ")");
			setTimeout(enyo.bind(this, "processQueue"), 1000 * op.retries);
		} else {
			this.failOpPermanently(op, this.describeFailure(inSender, inValue), "gave up after " + this.maxRetries + " attempts");
		}
	},
	//Dead-letter exactly one op. The old code called clearQueue() here, throwing
	//	away every unrelated pending edit because one of them was unsendable.
	failOpPermanently: function(op, detail, reason) {
		enyo.error("Dropping " + op.type + " for " + op.guid + ": " + reason);
		this.queueRetryCount = 0;
		this.removeOp(op);
		this.deadLetters.push({op: op, reason: reason, detail: detail});
		this.onPostError(op, detail, reason);
		//One bad op must not stall the ones behind it.
		if (this.hasPendingOps()) {
			setTimeout(enyo.bind(this, "processQueue"), 10);
		}
	},
	describeFailure: function(inSender, inValue) {
		if (inSender && inSender.xhrResponse && inSender.xhrResponse.body) {
			var body = inSender.xhrResponse.body;
			try {
				var parsed = enyo.json.parse(body);
				if (parsed && parsed.error) {
					return parsed.error;
				}
			} catch (err) {
				//Not JSON; fall through and use the raw body.
			}
			return body;
		}
		if (inValue === "timeout") {
			return "The server did not respond in time.";
		}
		return null;
	},
	takeDeadLetters: function() {
		var letters = this.deadLetters;
		this.deadLetters = [];
		return letters;
	},
	getQueueStatus: function() {
		return {
			length: this.updateQueue.length,
			processing: this.queueProcessing,
			retryCount: this.queueRetryCount,
			deadLettered: this.deadLetters.length
		};
	},
	clearQueue: function() {
		this.updateQueue = [];
		this.queueProcessing = false;
		this.queueRetryCount = 0;
		this.persistQueue();
		this.onQueueChanged();
	},

	/* ---- Reads ----------------------------------------------------------- */

	getTasks: function() {
		var useUrl = this.buildURL("read-notation") + "?move=" + this.notation;
		this.refreshSeq++;
		var seq = this.refreshSeq;
		this.activeRefreshSeq = seq;

		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			headers: {grandmaster: this.grandmaster},
			timeout: this.requestTimeout,
			cacheBust: true
		});
		request.error(enyo.bind(this, "handleRefreshFailure", seq), this);
		request.response(enyo.bind(this, "handleRefreshResponse", seq), this);
		request.go();
	},
	//Discard anything that isn't the newest outstanding refresh. Without this a
	//	response issued before a change could land after it and win, purely on
	//	arrival order.
	handleRefreshResponse: function(seq, inSender, inResponse) {
		if (seq !== this.activeRefreshSeq) {
			enyo.log("Ignoring superseded refresh response (" + seq + " of " + this.activeRefreshSeq + ")");
			return;
		}
		this.onRefreshSuccess(inSender, inResponse);
	},
	handleRefreshFailure: function(seq, inSender, inValue) {
		if (seq !== this.activeRefreshSeq) {
			return;
		}
		this.onRefreshError(inSender, this.describeFailure(inSender, inValue));
	},
	getTnC: function(success, failure) {
		var useUrl = this.buildURL("tandc").replace(".php",".html");
		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			timeout: this.requestTimeout,
			cacheBust: true
		});
		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
	//Ask the service to mint a brand new notation and grandmaster. Unauthenticated
	//	by design: this is how a user gets credentials in the first place, so there
	//	is nothing to authenticate with yet. The server picks both -- the user
	//	cannot choose them -- and this is the only time they are ever shown.
	getNewCredentials: function(success, failure) {
		var useUrl = this.buildURL("new-user");
		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			timeout: this.requestTimeout,
			cacheBust: true
		});
		request.error(enyo.bind(this, function(inSender, inValue) {
			failure(this.describeFailure(inSender, inValue));
		}));
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
	cleanupTasks: function(success, failure) {
		var useUrl = this.buildURL("cleanup-notation") + "?move=" + this.notation;
		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: this.grandmaster},
			timeout: this.requestTimeout,
			cacheBust: true
		});
		request.error(enyo.bind(this, function(inSender, inValue) {
			failure(this.describeFailure(inSender, inValue));
		}));
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	}
});
