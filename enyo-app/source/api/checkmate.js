/**
	For simple applications, you might define all of your views in this file.  
	For more complex applications, you might choose to separate these kind definitions 
	into multiple files under this folder.
*/
enyo.kind({
	name: "checkmate.api",
	notation: null,
	grandmaster: null,
	updateQueue: [],
	queueProcessing: false,
	queueRetryCount: 0,
	maxRetries: 3,
	onPostSuccess: function() {},
	onPostError: function() {},
	onRefreshSuccess: function() {},
	onRefreshError: function() {},
	create: function() {
		this.inherited(arguments);
		if (arguments && arguments[0]) {
			enyo.log("checkmate API created!");
		}
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
		enyo.log("Using insecure setting: " + this.getInsecure());
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
		var path = urlBase + "/" + actionType + ".php";
		return path;
	},
	getTnC: function(success, failure) {
		var useUrl = this.buildURL("tandc").replace(".php",".html");
		enyo.log("Getting Terms and Conditions with url: " + useUrl);
		
		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			cacheBust: true
		});

		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
	getTasks: function() {
		var useUrl = this.buildURL("read-notation") + "?move=" + this.notation;
		enyo.log("Getting task list with url: " + useUrl);
		
		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			headers: {grandmaster: this.grandmaster},
			cacheBust: true
		});
		request.error(this.onRefreshError, this);
		request.response(this.onRefreshSuccess, this);
		request.go();
	},
	updateTask: function(taskData) {
		if (!taskData) {
			enyo.warn("updateTask called with null/undefined taskData");
			return;
		}
		
		this.updateQueue.push(taskData);
		enyo.log("New update added to queue, length now: " + this.updateQueue.length);
		
		// Only start processing if not already running
		if (!this.queueProcessing) {
			this.processQueue();
		}
	},
	processQueue: function() {
		// Prevent concurrent processing
		if (this.queueProcessing) {
			enyo.log("Queue already processing, skipping");
			return;
		}
		
		if (this.updateQueue.length > 0) {
			this.queueProcessing = true;
			enyo.log("Processing update queue with " + this.updateQueue.length + " items");
			var taskData = this.updateQueue[0];
			this.doUpdateTask(taskData);
		} else {
			enyo.log("No updates queued.");
			this.getTasks();
		}
	},
	processQueueSuccess: function(inSender, inResponse) {
		this.queueProcessing = false;
		this.queueRetryCount = 0;
		this.updateQueue.shift();
		
		if (this.updateQueue.length == 0) {
			enyo.log("Finished processing updateQueue items!");
			this.onPostSuccess(inSender, inResponse);
			this.getTasks();
		} else {
			// Use setTimeout to prevent stack overflow on large queues
			setTimeout(enyo.bind(this, "processQueue"), 10);
		}
	},
	doUpdateTask: function(taskData) {
		var useUrl = this.buildURL("update-notation") + "?move=" + this.notation;
		enyo.log("Updating task list with url: " + useUrl);
		enyo.log("Using data: " + JSON.stringify(taskData));

		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: this.grandmaster},
			postBody: JSON.stringify(taskData),
			cacheBust: true
		});

		request.error(this.processQueueError, this);
		request.response(this.processQueueSuccess, this);
		request.go();
	},
	processQueueError: function(inSender, inResponse) {
		this.queueProcessing = false;
		this.queueRetryCount++;
		
		if (this.queueRetryCount < this.maxRetries) {
			enyo.warn("Queue processing failed, retrying (" + this.queueRetryCount + "/" + this.maxRetries + ")");
			setTimeout(enyo.bind(this, "processQueue"), 1000 * this.queueRetryCount);
		} else {
			enyo.error("Queue processing failed after " + this.maxRetries + " attempts, clearing queue");
			this.clearQueue();
			this.onPostError(inSender, inResponse);
		}
	},
	clearQueue: function() {
		this.updateQueue = [];
		this.queueProcessing = false;
		this.queueRetryCount = 0;
		enyo.log("Queue cleared");
	},
	getQueueStatus: function() {
		return {
			length: this.updateQueue.length,
			processing: this.queueProcessing,
			retryCount: this.queueRetryCount
		};
	},
	cleanupTasks: function(success, failure) {
		var useUrl = this.buildURL("cleanup-notation") + "?move=" + this.notation;
		enyo.log("Cleaning up completed task list with url: " + useUrl);

		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: this.grandmaster},
			cacheBust: true
		});

		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	}
});