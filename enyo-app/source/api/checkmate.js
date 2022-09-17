/**
	For simple applications, you might define all of your views in this file.  
	For more complex applications, you might choose to separate these kind definitions 
	into multiple files under this folder.
*/

enyo.kind({
	name: "checkmate.api",
	create: function() {
		this.inherited(arguments);
		if (arguments && arguments[0]) {
			enyo.log("checkmate API created with args: " + JSON.stringify(arguments[0]));
			this.serverConfig = arguments[0];
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
	getTasks: function(notation, grandmaster, success, failure) {
		useUrl = this.buildURL("read-notation") + "?move=" + notation;
		enyo.log("Getting task list with url: " + useUrl);
		
		var request = new enyo.Ajax({
			url: useUrl,
			method: "GET",
			headers: {grandmaster: grandmaster},
			cacheBust: false
		});

		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
	updateTask: function(notation, grandmaster, taskData, success, failure) {
		useUrl = this.buildURL("update-notation") + "?move=" + notation;
		enyo.log("Updating task list with url: " + useUrl);
		enyo.log("using data: " + JSON.stringify(taskData));

		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: grandmaster},
			postBody: JSON.stringify(taskData),
			cacheBust: false
		});

		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
	cleanupTasks: function(notation, grandmaster, success, failure) {
		useUrl = this.buildURL("cleanup-notation") + "?move=" + notation;
		enyo.log("Cleaning up completed task list with url: " + useUrl);

		var request = new enyo.Ajax({
			url: useUrl,
			method: "POST",
			headers: {grandmaster: grandmaster},
			cacheBust: false
		});

		request.error(failure);
		request.response(function(inRequest, inResponse) {
			success(inResponse);
		}, this);
		request.go();
	},
});