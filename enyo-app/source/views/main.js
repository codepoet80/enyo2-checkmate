var updateRate = 10000;
var updateInt = null;

enyo.kind({
	name: "checkmate.MainView",
	kind: "FittableRows",
	fit: true,
	selectedTask: null,
	notation: "",
	grandmaster: "",
	//Starts at zero. This was 2 against a threshold of 3, so the first transient
	//	error after launch dropped straight to offline instead of backing off.
	errorCount: 0,
	components:[
		{kind: 'SoundPlayer', name:"mySoundPlayer", sounds: [
			{kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'},
			{kind: 'enyo.Audio', name:"soundCheck", src: 'assets/check.mp3'},
			{kind: 'enyo.Audio', name:"soundUncheck", src: 'assets/uncheck.mp3'},
			{kind: 'enyo.Audio', name:"soundDelete", src: 'assets/delete.mp3'}
		]},
		{kind: 'wosa.updater', name:"myUpdater", onUpdateFound:"handleUpdateFound"},
		{kind: 'checkmate.api', name:"myCheckmate"},
		{kind: "Panels", name:"contentPanels", fit: true, classes:"app-panels",  narrowFit:false, arrangerKind: "CollapsingArranger", onTransitionFinish:"panelAnimationDone", wrap: false, components: [
			{kind:"checkmate.DetailViewer", name:"taskDetails", onSave:"updateTaskFromDetails" },
			{kind: "FittableRows", name:"body", classes:"taskListBody", fit:true, components: [
				{kind: "onyx.Toolbar", classes:"toolbar", components: [
					{tag: "img", classes:"toolbarIcon", attributes: {src: "icon.png"}},
					{name: "toolTitle", content: "Check Mate HD" },
					{kind: "onyx.Button", name: "buttonUpdate", classes:"buttonRightToolbar toolButton", ontap: "updateTap", components: [
						{tag: "img", name:"imgSync", attributes: {src: "assets/sync.png"}}
					]}
				]},
				{kind: "List", name:"list", fit:true, classes: "taskList", multiSelect:false, onSetupItem: "setupListItem",
					reorderable: true, onSetupReorderComponents: "listReorderStart", onReorder: "listReorderDone", centerReorderContainer: false,
					enableSwipe: true, onSetupSwipeItem: "listItemSwipeStart", onSwipeComplete: "listItemSwipeDone",
					components: [
						{name:"tasklistItem", classes: "tasklistItem", components: [
							{name: "taskTitle", classes: "itemTitle", ontap: "listItemTap", allowHtml: true },
							{name: "taskCheck", kind: "enyo.Checkbox", classes: "itemCheck", ontap: "listItemTap"}
						]}
					],
					reorderComponents: [
						{name: "reorderContent", classes: "enyo-fit reorderDragger itemMoving", components: [
							{name: "reorderTitle", classes: "itemMovingTitle", allowHtml: true}
						]}
					],
					swipeableComponents: [
						{name: "swipeItem", classes: "enyo-fit taskListItem", components: [
							{name: "swipeTitle", classes: "swipeTitle", content: "", allowHtml: true}
						]}
					]
				},
				{kind: "onyx.Toolbar", classes:"detailToolbarBottom", components: [
					{kind: 'onyx.Grabber', ondragstart: 'grabberDragstart', ondrag: 'grabberDrag', ondragfinish: 'grabberDragFinish'},
					{kind: "onyx.Button", classes:"toolButton", ontap: "newTaskTap", components: [
						{tag: "img", attributes: {src: "assets/plus.png"}}
					]},
					{kind: "onyx.Button", classes:"buttonRight toolButton", ontap: "sweepTap", components: [
						{tag: "img", attributes: {src: "assets/sweep.png"}}
					]},
					{kind: "onyx.Button", name:"buttonLoginOut", content: "Log In", classes:"buttonRight toolButton", ontap: "doSigninOut"}
				]}
			]}
		]},
		{kind: "enyo.Popup", name: "popupModal", modal: true, autoDismiss: false, centered: true, classes: "popup", components: [
			{name:"popupMessage", content: "", allowHtml:true},
			{classes:"spacer"},
			{kind: "enyo.Button", name: "buttonCloseModal", content: "Close", ontap: "closeModal"}
		]}
	],
	statics: {
		isScreenNarrow: function() {
			return enyo.dom.getWindowWidth() <= 600;
		}
	},
	create: enyo.inherit(function(sup) {
		return function() {
			sup.apply(this, arguments);
			//serverTasks is the last thing the server told us and is written ONLY
			//	by a refresh. viewTasks is derived: server truth with the pending
			//	op log replayed over it. Nothing mutates viewTasks in place, so a
			//	refresh landing mid-edit cannot destroy an intent that hasn't been
			//	sent yet.
			this.serverTasks = [];
			this.viewTasks = [];
			this.holdTimer = null;
			this.serviceWorkerVersion = null;
		};
	}),
	//Naming a task exactly this fills its notes with the running build instead of
	//	whatever was typed, so "is the PWA actually updated?" has an answer you can
	//	read on the device -- and, because it syncs, from any other client too.
	buildInfoTitle: "about:version",
	rendered: enyo.inherit(function(sup) {
		return function() {
			sup.apply(this, arguments);
			this.startSpinner();
			var notation = Prefs.getCookie("move", null);
			var grandmaster = Prefs.getCookie("grandmaster", null);
			var serverConfig = Prefs.getCookie("serverConfig", null);
			//Setup API events
			//	Note: although Enyo provides for public events, it doesn't let you change the call-back signature.
			//	So we can't bind these Enyo style. We'll do it this way instead...
			this.$.myCheckmate.onRefreshSuccess = enyo.bind(this, "handleRefreshSuccess");
			this.$.myCheckmate.onRefreshError = enyo.bind(this, "handleRefreshError");
			this.$.myCheckmate.onPostSuccess = enyo.bind(this, "handlePostSuccess");
			this.$.myCheckmate.onPostError = enyo.bind(this, "handlePostError");
			this.$.myCheckmate.onQueueChanged = enyo.bind(this, "handleQueueChanged");
			if (serverConfig && notation && grandmaster) {
				this.$.myCheckmate.setUrlBase(serverConfig.urlBase);
				this.$.myCheckmate.setInsecure(serverConfig.insecure);
				this.$.myCheckmate.setUseCustomServer(serverConfig.useCustomServer);
				this.$.myCheckmate.setCustomServer(serverConfig.customServer);

				this.$.myCheckmate.notation = notation;
				this.$.myCheckmate.grandmaster = grandmaster;

				//Anything left in the queue from a previous run is already on
				//	screen via the projection; show it before the network answers.
				this.refreshProjection();
				this.loadTaskList();
				this.$.buttonLoginOut.setContent("Log Out");
			}
			else {
				window.setTimeout(enyo.bind(this, "doSigninOut"), 500);
			}
			this.$.contentPanels.setIndex(1);
			this.readServiceWorkerVersion();

			if (typeof device !== 'undefined' && device.platform) {
				this.doUpdateCheck();
			}
			else {
				document.addEventListener('deviceready', enyo.bind(this, "doUpdateCheck"), false);
			}
		};
	}),

	/* ---- Projection ------------------------------------------------------ */

	cloneTask: function(task) {
		var copy = {};
		for (var key in task) {
			if (task.hasOwnProperty(key)) {
				copy[key] = task[key];
			}
		}
		return copy;
	},
	//Highest sortPosition first, matching the service. Decorated with the
	//	original index so ties keep their order on engines whose Array#sort
	//	isn't stable -- which includes the WebKit these devices ship.
	sortTasks: function(tasks) {
		var decorated = [];
		for (var i = 0; i < tasks.length; i++) {
			decorated.push({task: tasks[i], index: i});
		}
		decorated.sort(function(a, b) {
			var pa = parseInt(a.task.sortPosition, 10) || 0;
			var pb = parseInt(b.task.sortPosition, 10) || 0;
			if (pa !== pb) {
				return pb - pa;
			}
			return a.index - b.index;
		});
		var sorted = [];
		for (var j = 0; j < decorated.length; j++) {
			sorted.push(decorated[j].task);
		}
		return sorted;
	},
	//serverTasks + pendingOps -> what the user should see. Pure: same inputs
	//	always give the same output, and it never touches either input.
	projectTasks: function(serverTasks, ops) {
		var map = {};
		var order = [];
		var i, j, guid;

		for (i = 0; i < serverTasks.length; i++) {
			guid = serverTasks[i].guid;
			map[guid] = this.cloneTask(serverTasks[i]);
			order.push(guid);
		}

		for (i = 0; i < ops.length; i++) {
			var op = ops[i];
			var held = this.$.myCheckmate.isOpHeld(op);
			//A reorder carries a list; everything else carries one task. Treating
			//	them uniformly keeps the replay loop simple.
			var opTasks = (op.type === "reorder") ? op.task : [op.task];

			for (j = 0; j < opTasks.length; j++) {
				var t = opTasks[j];
				guid = t.guid;
				if (parseInt(t.sortPosition, 10) === -1) {
					if (held) {
						//Still inside the undo window: keep the row, flagged, so
						//	it renders as "swipe again to restore".
						if (map[guid]) {
							map[guid]._deleting = true;
						}
					} else if (map[guid]) {
						delete map[guid];
					}
				} else {
					if (!map[guid]) {
						map[guid] = this.cloneTask(t);
						order.push(guid);
					} else {
						var overlay = this.cloneTask(t);
						for (var key in overlay) {
							if (overlay.hasOwnProperty(key)) {
								map[guid][key] = overlay[key];
							}
						}
					}
					map[guid]._pending = true;
					map[guid]._deleting = false;
				}
			}
		}

		var projected = [];
		for (i = 0; i < order.length; i++) {
			if (map[order[i]]) {
				projected.push(map[order[i]]);
				//Guard against a guid appearing twice in `order`.
				map[order[i]] = null;
			}
		}
		return this.sortTasks(projected);
	},
	refreshProjection: function() {
		var next = this.projectTasks(this.serverTasks, this.$.myCheckmate.getPendingOps());
		this.applyViewTasks(next);
		this.scheduleHoldExpiry();
	},
	//Re-render as little as possible. Only a change in length or in the guid
	//	order forces the full reset that makes the list jump.
	applyViewTasks: function(next) {
		var previous = this.viewTasks;
		var structural = (previous.length !== next.length);
		var i;

		if (!structural) {
			for (i = 0; i < next.length; i++) {
				if (previous[i].guid !== next[i].guid) {
					structural = true;
					break;
				}
			}
		}

		this.viewTasks = next;

		if (structural) {
			this.$.list.setCount(next.length);
			this.$.list.reset();
		} else {
			for (i = 0; i < next.length; i++) {
				if (!this.tasksEqual(previous[i], next[i])) {
					this.$.list.renderRow(i);
				}
			}
		}
		this.reselectTask();
	},
	tasksEqual: function(a, b) {
		if (!a || !b) {
			return false;
		}
		var aDone = a.completed ? true : false;
		var bDone = b.completed ? true : false;
		var aDeleting = a._deleting ? true : false;
		var bDeleting = b._deleting ? true : false;
		return a.guid === b.guid &&
			a.title === b.title &&
			a.notes === b.notes &&
			aDone === bDone &&
			String(a.sortPosition) === String(b.sortPosition) &&
			aDeleting === bDeleting;
	},
	reselectTask: function() {
		if (!this.selectedTask) {
			return;
		}
		for (var i = 0; i < this.viewTasks.length; i++) {
			if (this.viewTasks[i].guid === this.selectedTask.guid) {
				this.$.list.select(i);
				return;
			}
		}
	},
	findTaskByGuid: function(guid) {
		for (var i = 0; i < this.viewTasks.length; i++) {
			if (this.viewTasks[i].guid === guid) {
				return this.viewTasks[i];
			}
		}
		return null;
	},
	//The op log is authoritative for when a held delete goes out; this timer is
	//	only an optimisation so the user doesn't wait for the next poll. If it
	//	never fires, the poll still drains the queue.
	scheduleHoldExpiry: function() {
		if (this.holdTimer) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
		var ops = this.$.myCheckmate.getPendingOps();
		var soonest = null;
		var now = new Date().getTime();
		for (var i = 0; i < ops.length; i++) {
			if (!ops[i].inFlight && ops[i].sendAfter > now) {
				if (soonest === null || ops[i].sendAfter < soonest) {
					soonest = ops[i].sendAfter;
				}
			}
		}
		if (soonest !== null) {
			this.holdTimer = window.setTimeout(enyo.bind(this, "holdExpired"), (soonest - now) + 50);
		}
	},
	holdExpired: function() {
		this.holdTimer = null;
		this.refreshProjection();
		this.$.myCheckmate.processQueue();
	},
	handleQueueChanged: function() {
		this.refreshProjection();
	},
	//Client-side UUIDv4. Creating the id here makes a create idempotent: a retry
	//	targets the same guid instead of asking the server for another new task,
	//	and the optimistic row needs no reconciliation when the server answers.
	generateGuid: function() {
		var chars = "0123456789abcdef";
		var uuid = "";
		for (var i = 0; i < 32; i++) {
			if (i === 12) {
				uuid += "4";
			} else if (i === 16) {
				uuid += chars.charAt((Math.floor(Math.random() * 16) & 0x3) | 0x8);
			} else {
				uuid += chars.charAt(Math.floor(Math.random() * 16));
			}
			if (i === 7 || i === 11 || i === 15 || i === 19) {
				uuid += "-";
			}
		}
		return uuid;
	},
	nextSortPosition: function() {
		var highest = 0;
		for (var i = 0; i < this.viewTasks.length; i++) {
			var pos = parseInt(this.viewTasks[i].sortPosition, 10) || 0;
			if (pos > highest) {
				highest = pos;
			}
		}
		return highest + 1;
	},
	//Strip the projection's bookkeeping before anything goes over the wire.
	toWireTask: function(task) {
		return {
			guid: task.guid,
			title: task.title,
			notes: task.notes || "",
			completed: !!task.completed,
			sortPosition: task.sortPosition
		};
	},

	/* Build identity */
	//Asked once at startup rather than when the note is written, so the answer is
	//	already in hand and building the note stays synchronous. Every step here is
	//	guarded: none of this exists on the webOS browser, and the app has to keep
	//	working there.
	readServiceWorkerVersion: function() {
		this.serviceWorkerVersion = null;
		if (typeof navigator === "undefined" || !navigator.serviceWorker) {
			this.serviceWorkerVersion = "none (not supported here)";
			return;
		}
		if (!navigator.serviceWorker.controller) {
			//Normal on the very first load: the worker installs but doesn't take
			//	over until the next navigation.
			this.serviceWorkerVersion = "registered, not yet controlling this page";
			return;
		}
		if (typeof MessageChannel === "undefined") {
			this.serviceWorkerVersion = "controlling (version unavailable)";
			return;
		}
		try {
			var channel = new MessageChannel();
			channel.port1.onmessage = enyo.bind(this, function(inEvent) {
				if (inEvent && inEvent.data && inEvent.data.cacheName) {
					this.serviceWorkerVersion = inEvent.data.cacheName;
				}
			});
			this.serviceWorkerVersion = "controlling (awaiting reply)";
			navigator.serviceWorker.controller.postMessage({type: "GET_CACHE_STATUS"}, [channel.port2]);
		} catch (err) {
			enyo.warn("Could not read the service worker version: " + err);
			this.serviceWorkerVersion = "controlling (query failed)";
		}
	},
	isBuildInfoTitle: function(title) {
		return !!title && title === this.buildInfoTitle;
	},
	/* Updater */
	doUpdateCheck: function() {
		this.$.myUpdater.CheckForUpdate("Check Mate HD");
	},
	handleUpdateFound: function() {
		this.showModal("Update found!<br>" + this.$.myUpdater.UpdateMessage + "<br>Visit your App Store to download it!");
	},
	/* Sign In */
	doSigninOut: function() {
		window.clearInterval(updateInt);
		this.errorCount = 0;
		this.notation = "";
		Prefs.setCookie("move", this.notation);
		this.grandmaster = "";
		Prefs.setCookie("grandmaster", this.grandmaster);
		this.$.buttonLoginOut.setContent("Log In");
		var newComponent = this.$.contentPanels.createComponent({
			name: "signinPanel", kind: "checkmate.Signin",
			onLogin:"loginDone", onMessage:"showModalFromLogin"
		}, {owner: this});
		newComponent.serverConfig = this.serverConfig;
		newComponent.render();
		this.$.contentPanels.render();
		this.$.contentPanels.setIndex(2);
		this.$.contentPanels.draggable = false;
	},
	loginDone: function() {
		this.serverConfig = {
			urlBase: this.$.signinPanel.getUrlBase(),
			insecure: this.$.signinPanel.getInsecure(),
			useCustomServer: this.$.signinPanel.getUseCustomServer(),
			customServer: this.$.signinPanel.getCustomServer()
		};
		Prefs.setCookie("serverConfig", this.serverConfig);
		this.$.myCheckmate.serverConfig = this.serverConfig;

		this.$.myCheckmate.notation = this.$.signinPanel.move;
		Prefs.setCookie("move", this.$.signinPanel.move);

		this.$.myCheckmate.grandmaster = this.$.signinPanel.grandmaster;
		Prefs.setCookie("grandmaster", this.$.signinPanel.grandmaster);

		this.$.contentPanels.getActive().destroy();
		this.$.contentPanels.components.pop();
		this.$.contentPanels.setIndex(1);
		this.$.contentPanels.render();
		this.$.contentPanels.draggable = true;
		this.$.buttonLoginOut.setContent("Log Out");
		window.setTimeout(enyo.bind(this, "loadTaskList"), 800);
	},
	/* UI Events */
	newTaskTap: function() {
		this.selectedTask = null;
		this.$.list.reset();
		this.$.taskDetails.newTask();
		this.$.contentPanels.setIndex(0);
	},
	updateTap: function() {
		this.errorCount = 0;
		this.loadTaskList();
	},
	sweepTap: function() {
		this.$.mySoundPlayer.soundSweep.Play();
		this.$.myCheckmate.cleanupTasks(
			enyo.bind(this, function(inResponse) {
				if (inResponse && inResponse.tasks) {
					this.serverTasks = inResponse.tasks;
					this.refreshProjection();
				} else {
					this.handleAPIError(inResponse);
				}
			}),
			enyo.bind(this, function(detail) {
				//The user pressed a button, so answer the button rather than
				//	routing through the polling back-off, which stays silent.
				this.showModal("<b>Sweep failed</b><br><br>" + (detail || "The completed tasks could not be cleared."));
			})
		);
	},
	setupListItem: function(inSender, inEvent) {
		var data = this.viewTasks[inEvent.index];
		if (!data) {
			return;
		}
		this.$.tasklistItem.addRemoveClass("itemSelected", this.$.list.isSelected(inEvent.index));
		if (data._deleting) {
			this.$.tasklistItem.addClass("itemDeleting");
			this.$.taskTitle.setContent("<i>Swipe again to restore...</i>");
		}
		else {
			this.$.tasklistItem.removeClass("itemDeleting");
			this.$.taskTitle.setContent(data.title);
		}
		this.$.taskCheck.setValue(!!data.completed);
	},
	listItemTap: function(inSender, inEvent) {
		var data = this.viewTasks[inEvent.index];
		if (!data) {
			return;
		}
		if (!this.$.taskDetails.inEdit) {
			if (inSender.kind == "enyo.Checkbox") {
				//Queue the intent; the projection puts it on screen. We never
				//	write to viewTasks directly, so the next refresh can't undo it.
				var toggled = this.toWireTask(data);
				toggled.completed = !data.completed;
				inSender.setValue(toggled.completed);
				this.$.myCheckmate.updateTask(toggled);
				if (toggled.completed) {
					this.$.mySoundPlayer.soundCheck.Play();
				}
				else {
					this.$.mySoundPlayer.soundUncheck.Play();
				}
				return true;
			} else {
				this.selectedTask = data;
				this.$.taskDetails.taskGuid = data.guid;
				this.$.taskDetails.taskTitle = data.title || "";
				this.$.taskDetails.taskNotes = data.notes || "";
				this.$.taskDetails.render();
			}
		} else {
			if (this.$.contentPanels.getActive() == "app_mainView_taskDetails [checkmate.DetailViewer]") {
				return true;
			} else {
				this.$.taskDetails.editCancelTap();
			}
		}
	},
	listReorderStart: function(inSender, inEvent) {
		var data = this.viewTasks[inEvent.index];
		if (!data) {
			return;
		}
		if (this.$.taskDetails.inEdit) {
			return;
		}
		this.$.reorderTitle.setContent(data.title);
		return true;
	},
	listReorderDone: function(inSender, inEvent) {
		var from = inEvent.reorderFrom;
		var to = inEvent.reorderTo;
		if (!this.viewTasks[from] || !this.viewTasks[to]) {
			return;
		}
		if (this.$.taskDetails.inEdit) {
			return;
		}
		if (this.viewTasks[from].sortPosition == this.viewTasks[to].sortPosition) {
			return;
		}

		//Work on a copy: renumbering in place would mutate the projection, which
		//	is meant to be derived and disposable.
		var reordered = [];
		var i;
		for (i = 0; i < this.viewTasks.length; i++) {
			reordered.push(this.toWireTask(this.viewTasks[i]));
		}
		var moved = reordered.splice(from, 1)[0];
		reordered.splice(to, 0, moved);

		var position = 1;
		for (i = reordered.length - 1; i >= 0; i--) {
			reordered[i].sortPosition = position;
			position++;
		}
		this.$.myCheckmate.queueBatch(reordered);
		this.$.myCheckmate.processQueue();
	},
	listItemSwipeStart: function(inSender, inEvent) {
		var data = this.viewTasks[inEvent.index];
		if (!data || this.$.taskDetails.inEdit) {
			return;
		}
		this.$.swipeItem.removeClass("swipeInfo");
		this.$.swipeItem.removeClass("swipeDelete");
		this.$.swipeItem.removeClass("swipeUndo");
		if (!data._deleting) {
			if (inEvent.xDirection == 1) {
				this.$.swipeTitle.setContent("<img src='assets/info.png' style='height:32px'>");
				this.$.swipeItem.addClass("swipeInfo");
			}
			else {
				this.$.swipeTitle.setContent("<img src='assets/delete.png' style='height:32px'>");
				this.$.swipeItem.addClass("swipeDelete");
			}
		} else {
			this.$.swipeTitle.setContent("<img src='assets/undo.png' style='height:32px'>");
			this.$.swipeItem.addClass("swipeUndo");
		}
		return true;
	},
	listItemSwipeDone: function(inSender, inEvent) {
		var data = this.viewTasks[inEvent.index];
		if (!data || this.$.taskDetails.inEdit) {
			return;
		}
		if (!data._deleting) {
			if (inEvent.xDirection == 1) {
				this.selectedTask = data;
				this.$.list.select(inEvent.index);
				this.$.taskDetails.taskGuid = data.guid;
				this.$.taskDetails.taskTitle = data.title || "";
				this.$.taskDetails.taskNotes = data.notes || "";
				this.$.taskDetails.render();
				if (this.$.contentPanels.getActive() == "app_mainView_body [enyo.FittableRows]") {
					this.$.contentPanels.setIndex(0);
				}
				else {
					this.$.contentPanels.setIndex(1);
				}
			}
			else {
				//The delete is an op held for its undo window, not a setTimeout
				//	over a shared object. A refresh landing in the window rewrites
				//	serverTasks and leaves the op -- and therefore the delete -- alone.
				this.$.list.deselect(inEvent.index);
				var tombstone = this.toWireTask(data);
				tombstone.sortPosition = -1;
				this.$.myCheckmate.queueOp(tombstone, "delete", this.$.myCheckmate.deleteHoldMs);
				this.$.mySoundPlayer.soundDelete.Play();
				if (this.$.taskDetails.taskGuid === data.guid) {
					this.$.taskDetails.reset();
				}
			}
		} else {
			//Undo is just dropping the op, which is atomic and can't be raced.
			var ops = this.$.myCheckmate.getPendingOps();
			for (var i = ops.length - 1; i >= 0; i--) {
				if (ops[i].type === "delete" && ops[i].guid === data.guid) {
					if (this.$.myCheckmate.cancelOp(ops[i].id)) {
						break;
					}
				}
			}
		}
	},
	updateTaskFromDetails: function() {
		this.$.contentPanels.setIndex(1);

		var title = this.$.taskDetails.taskTitle;
		var notes = this.$.taskDetails.taskNotes;

		//Applied on edit as well as create, so re-saving the task refreshes the
		//	reading rather than leaving a stale one on screen.
		if (this.isBuildInfoTitle(title)) {
			notes = BuildInfo.describe(this.serviceWorkerVersion);
		}
		var wasEditing = !!this.selectedTask;
		var existing = wasEditing ? this.findTaskByGuid(this.selectedTask.guid) : null;

		//An edit whose task vanished underneath us (deleted here or elsewhere)
		//	must not silently fall through to the create branch -- that would
		//	resurrect it under a brand new guid as a duplicate.
		if (wasEditing && !existing) {
			this.selectedTask = null;
			this.showModal("That task no longer exists, so the change wasn't saved.");
			return true;
		}

		if (existing) {
			//The service rejects an empty title outright, which would dead-letter
			//	the op. Refuse it here where we can actually tell the user.
			if (!title || title === "") {
				this.showModal("A task needs a title.");
				return true;
			}
			var edited = this.toWireTask(existing);
			edited.title = title;
			edited.notes = notes;
			this.selectedTask = null;
			this.$.myCheckmate.updateTask(edited);
		}
		else if (title && title !== "") {
			this.$.myCheckmate.updateTask({
				guid: this.generateGuid(),
				title: title,
				notes: notes || "",
				completed: false,
				sortPosition: this.nextSortPosition()
			});
		}
		return true;
	},

	/* API Functions */
	loadTaskList: function() {
		this.startSpinner();
		//Drain first, then pull, so a refresh always observes our own writes.
		this.$.myCheckmate.processQueue();
	},
	doBackgroundRefresh: function() {
		this.$.myCheckmate.processQueue();
	},
	//Always re-arm. The old code cleared the interval before deciding whether to
	//	do anything, so any early return left the app with no poll at all.
	scheduleNextRefresh: function() {
		window.clearInterval(updateInt);
		updateInt = window.setInterval(enyo.bind(this, "doBackgroundRefresh"), updateRate);
	},
	startSpinner: function() {
		this.$.buttonUpdate.addClass("active");
		this.$.imgSync.setAttribute("src", "assets/sync-spin.gif");
		this.$.buttonUpdate.setDisabled(true);
	},
	stopSpinner: function() {
		window.setTimeout(enyo.bind(this, function() {
			this.$.buttonUpdate.removeClass("active");
			this.$.imgSync.setAttribute("src", "assets/sync.png");
			//Re-enable it. This used to set disabled = true here as well, which
			//	left the manual sync button permanently off.
			this.$.buttonUpdate.setDisabled(false);
		}), 1200);
	},
	backoffToOffline: function(reason) {
		if (reason) {
			enyo.warn("Backing off, error count: " + this.errorCount + " because: " + reason);
			this.scheduleNextRefresh();
		}
		if (this.errorCount >= 3) {
			this.showAsOffline();
		}
	},
	showAsOffline: function() {
		window.clearInterval(updateInt);
		this.stopSpinner();
		window.setTimeout(enyo.bind(this, function() {
			this.$.buttonUpdate.removeClass("active");
			this.$.imgSync.setAttribute("src", "assets/offline.png");
			this.$.buttonUpdate.setDisabled(false);
		}), 1800);
		this.errorCount = 0;
	},
	handlePostSuccess: function(inSender, inResponse, moreQueued) {
		this.errorCount = 0;
		//The POST response already carries the authoritative list, so applying it
		//	here removes a whole round trip and one more window in which a stale
		//	GET could land.
		this.serverTasks = inResponse.tasks;
		this.refreshProjection();
		if (moreQueued) {
			this.$.myCheckmate.processQueue();
		} else {
			this.stopSpinner();
			this.scheduleNextRefresh();
		}
	},
	handlePostError: function(op, detail, reason) {
		//The op is gone from the queue but the user's intent is not silently
		//	lost: say which task, and what happened to it.
		var label = "A change could not be saved.";
		if (op && op.task && op.task.title) {
			label = "\"" + op.task.title + "\" could not be saved.";
		}
		this.errorCount++;
		this.refreshProjection();
		this.showModal("<b>" + label + "</b><br><br>" + (detail || reason));
		this.stopSpinner();
		this.scheduleNextRefresh();
	},
	handleRefreshSuccess: function(inSender, inResponse) {
		this.stopSpinner();
		if (inResponse && inResponse.tasks) {
			this.errorCount = 0;
			//A refresh may only write server truth. Local intent lives in the op
			//	log and is replayed on top, so nothing pending can be clobbered.
			this.serverTasks = inResponse.tasks;
			this.refreshProjection();
			this.scheduleNextRefresh();
		} else {
			this.handleAPIError(inResponse);
		}
	},
	handleRefreshError: function(inSender, detail) {
		this.handleAPIError({error: detail, failed: true, xhrResponse: inSender ? inSender.xhrResponse : null});
		this.stopSpinner();
	},
	/* UI Controls */
	handleAPIError: function(errorResponse) {
		this.errorCount++;
		var status = null;
		if (errorResponse && errorResponse.xhrResponse && errorResponse.xhrResponse.status) {
			status = errorResponse.xhrResponse.status;
		}
		//Transient: a timeout, a dropped connection, or a 5xx. Keep polling and
		//	stay quiet -- nagging the user about a blip they can't act on is how
		//	the app used to end up offline over a momentary write collision.
		if (status === null || status >= 500) {
			this.backoffToOffline(status ? ("API call with error code: " + status) : "API call with no status");
			return;
		}
		//Permanent: wrong credentials, unknown move, malformed request. It won't
		//	fix itself, so say what the server said and stop polling.
		var message = (errorResponse && errorResponse.error) ? errorResponse.error :
			"An error occured during an API call. Check your server settings and network connection. If you are self-hosting, make sure you have CORS setup correctly.";
		this.showModal("<b>Error</b><br><br>" + message);
		this.showAsOffline();
	},
	showModalFromLogin: function() {
		this.showModal(this.$.signinPanel.messageToShow);
	},
	showModal: function(message) {
		this.$.popupMessage.setContent(message);
		this.$.popupModal.setShowing(true);
	},
	closeModal: function() {
		this.$.popupModal.setShowing(false);
	},
	grabberDragstart: function() {
		//unused, handling panel animation events is more reliable
	},
	grabberDragFinish: function() {
		//unused, handling panel animation events is more reliable
	},
	panelAnimationDone: function() {
		if (this.$.contentPanels.getActive() != "app_mainView_body [enyo.FittableRows]") {
			if (!this.selectedTask || this.selectedTask.title === "") {
				this.$.taskDetails.newTask();
			}
		}
		else {
			this.$.taskDetails.render();
			if (this.$.taskDetails.inEdit) {
				this.$.taskDetails.editCancelTap();
			}
		}
	}
});
