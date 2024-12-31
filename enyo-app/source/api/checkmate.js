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
	serverConfig: { 
		urlBase: "",
		insecure: false,
		useCustomServer: false,
		customServer:""
	},
	buildURL: function(actionType) {
		var urlBase = this.serverConfig.urlBase;
		if (this.serverConfig.useCustomServer == true && this.serverConfig.customServer != "") {
			urlBase = this.serverConfig.customServer;
		}
		if (urlBase.indexOf("http://") == -1 && urlBase.indexOf("https://") == -1) {
			urlBase = "https://" + urlBase;
		}
		if (this.serverConfig.insecure) {
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
		useUrl = this.buildURL("tandc").replace(".php",".html");
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
		useUrl = this.buildURL("read-notation") + "?move=" + this.notation;
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
		this.updateQueue.push(taskData);
		enyo.log("New update added to queue, length now: " + this.updateQueue.length);
		this.processQueue();
	},
	processQueue: function() {
		if (this.updateQueue.length > 0) {
			enyo.log("Processing update queue with " + this.updateQueue.length + " items");
			taskData = this.updateQueue[0];
			this.doUpdateTask(taskData);
		} else {
			enyo.log("No updates queued.");
			this.getTasks();
		}
	},
	processQueueSuccess: function(inSender, inResponse) {
		this.updateQueue.shift();
		if (this.updateQueue.length == 0) {
			enyo.log("Finished processing updateQueue items!");
			this.onPostSuccess(inSender, inResponse);
			this.getTasks();
		} else {
			this.processQueue();
		}
	},
	doUpdateTask: function(taskData) {
		useUrl = this.buildURL("update-notation") + "?move=" + this.notation;
		enyo.log("Updating task list with url: " + useUrl);
		enyo.log("Using data: " + JSON.stringify(taskData));

		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: this.grandmaster},
			postBody: JSON.stringify(taskData),
			cacheBust: true
		});

		request.error(this.onPostError);
		request.response(this.processQueueSuccess, this);
		request.go();
	},
	cleanupTasks: function(success, failure) {
		useUrl = this.buildURL("cleanup-notation") + "?move=" + this.notation;
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