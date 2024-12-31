updateRate = 10000;
isUpdating = false;
cancelUpdate = false;
updateInt = null;
enyo.kind({
	name: "checkmate.MainView",
	kind: "FittableRows",
	fit: true,
	selectedTask: null,
	cancelDeletes: [],
	notation: "",
	grandmaster: "",
	data: [],
	errorCount: 2,
	components:[
		{kind: 'SoundPlayer', name:"mySoundPlayer", sounds: [
			{kind: 'enyo.Audio', name:"soundSweep", src: 'assets/sweep.mp3'},
			{kind: 'enyo.Audio', name:"soundCheck", src: 'assets/check.mp3'},
			{kind: 'enyo.Audio', name:"soundUncheck", src: 'assets/uncheck.mp3'},
			{kind: 'enyo.Audio', name:"soundDelete", src: 'assets/delete.mp3'},
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
						{tag: "img", name:"imgSync", attributes: {src: "assets/sync.png"}},
					]},
				]},
				{kind: "List", name:"list", fit:true, classes: "taskList", multiSelect:false, onSetupItem: "setupListItem", 
					reorderable: true, onSetupReorderComponents: "listReorderStart", onReorder: "listReorderDone", centerReorderContainer: false,
					enableSwipe: true, onSetupSwipeItem: "listItemSwipeStart", onSwipeComplete: "listItemSwipeDone",
					components: [
						{name:"tasklistItem", classes: "tasklistItem", components: [
							{name: "taskTitle", classes: "itemTitle", ontap: "listItemTap", allowHtml: true },
							{name: "taskCheck", kind: "enyo.Checkbox", classes: "itemCheck", ontap: "listItemTap"},
						]},
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
				{kind: "onyx.Toolbar", classes:"toolbar", components: [
					{kind: 'onyx.Grabber', ondragstart: 'grabberDragstart', ondrag: 'grabberDrag', ondragfinish: 'grabberDragFinish'},
					{kind: "onyx.Button", classes:"toolButton", ontap: "newTaskTap", components: [
						{tag: "img", attributes: {src: "assets/plus.png"}},
					]},
					{kind: "onyx.Button", classes:"buttonRight toolButton", ontap: "sweepTap", components: [
						{tag: "img", attributes: {src: "assets/sweep.png"}},
					]},
					{kind: "onyx.Button", name:"buttonLoginOut", content: "Login", classes:"buttonRight toolButton", ontap: "doSigninOut"},
				]},
			]},
		]},	
		{kind: "enyo.Popup", name: "popupModal", modal: true, autoDismiss: false, centered: true, classes: "popup", components: [
			{name:"popupMessage", content: "", allowHtml:true},
			{classes:"spacer"},
			{kind: "enyo.Button", name: "buttonCloseModal", content: "Close", ontap: "closeModal"}
		]},
	],
	statics: {
        isScreenNarrow: function() {
            return enyo.dom.getWindowWidth() <= 600;
        }
    },
	rendered: enyo.inherit(function(sup) {
		return function() {
			sup.apply(this, arguments);
			this.startSpinner();
			notation = Prefs.getCookie("move", null);
			grandmaster = Prefs.getCookie("grandmaster", null);
			serverConfig = Prefs.getCookie("serverConfig", null);
			if (serverConfig && notation && grandmaster) {
				enyo.log("Using server config and credentials from cookies");
				//Setup API connection
				this.$.myCheckmate.serverConfig = serverConfig;
				this.$.myCheckmate.notation = notation;
				this.$.myCheckmate.grandmaster = grandmaster;
				//Setup API events
				//	Note: although Enyo provides for public events, it doesn't let you change the call-back signature.
				//	So we can't bind these Enyo style. We'll do it this way instead...
				this.$.myCheckmate.onRefreshSuccess = this.handleRefreshSuccess.bind(this);
				this.$.myCheckmate.onRefreshError = this.handleRefreshError.bind(this);
				this.$.myCheckmate.onPostSuccess = this.handlePostSuccess.bind(this);
				this.$.myCheckmate.onPostError = this.handlePostError.bind(this);
				//Ready to load the task list!
				this.loadTaskList();
			}
			else {
				window.setTimeout(this.doSigninOut.bind(this), 500);
			}
			this.$.contentPanels.setIndex(1);
			enyo.log("narrow state is: " + enyo.Panels.isScreenNarrow());

			if (typeof device !== 'undefined' && device.platform) {
				enyo.log("doing update check right away")
				this.doUpdateCheck();
			}
			else {
				enyo.log("doing update check when ready")
				document.addEventListener('deviceready', this.doUpdateCheck.bind(this), false);
			}
		};
	}),
	/* Updater */
	doUpdateCheck: function() {
		//Check for updates
		this.$.myUpdater.CheckForUpdate("Check Mate HD");
	},
	handleUpdateFound: function(sender, message) {
		this.showModal("Update found!<br>" + this.$.myUpdater.UpdateMessage + "<br>Visit your App Store to download it!");
	},
	/* Sign In */
	doSigninOut: function() {
		this.notation = "";
		Prefs.setCookie("move", this.notation);
		this.grandmaster = "";
		Prefs.setCookie("grandmaster", this.grandmaster);
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
		this.serverConfig = this.$.signinPanel.serverConfig;
		enyo.log("New user server config: " + JSON.stringify(this.serverConfig));
		Prefs.setCookie("serverConfig", this.serverConfig);
		this.$.myCheckmate.serverConfig = this.serverConfig;

		enyo.log("New user move: " + this.$.signinPanel.move);
		this.$.myCheckmate.notation = this.$.signinPanel.move;
		Prefs.setCookie("move", this.$.signinPanel.move);

		enyo.log("New user grandmaster: " + this.$.signinPanel.grandmaster);
		this.$.myCheckmate.grandmaster = this.$.signinPanel.grandmaster;
		Prefs.setCookie("grandmaster", this.$.signinPanel.grandmaster);

		this.$.contentPanels.getActive().destroy();
		this.$.contentPanels.components.pop();
		this.$.contentPanels.setIndex(1);
		this.$.contentPanels.render();
		this.$.contentPanels.draggable = true;
		
		window.setTimeout(this.loadTaskList.bind(this), 500);
	},
	/* UI Events */
	newTaskTap: function() {
		this.selectedTask = null;
		this.$.list.reset();
		this.$.taskDetails.newTask();
		this.$.contentPanels.setIndex(0);
	},
	updateTap: function(inSender, inEvent) {
		this.errorCount = 0;
		this.loadTaskList();
	},
	sweepTap: function(inSender, inEvent) {
		this.$.mySoundPlayer.soundSweep.Play();
		
		this.$.myCheckmate.cleanupTasks(function(inResponse) {
				if (inResponse && inResponse.tasks) {
					//enyo.log("sweep tasks response! " + JSON.stringify(inResponse));
					this.data = inResponse.tasks;
					this.$.list.setCount(this.data.length);
					this.$.list.reset();

					for (var i=0;i<this.data.length;i++) {
						if (this.selectedTask && this.selectedTask.guid == this.data[i].guid)
							this.$.list.select(i);
					}
				} else {
					this.handleAPIError(inResponse);
				}
			}, function(){
				this.handleAPIError(inResponse);
			}
		);
	},
	setupListItem: function(inSender, inEvent) {
		if(!this.data[inEvent.index]) {
			return;
		}
		var data = this.data[inEvent.index];
		this.$.tasklistItem.addRemoveClass("itemSelected", this.$.list.isSelected(inEvent.index));
		if (data.sortPosition == -1) {
			this.$.tasklistItem.addClass("itemDeleting");
			this.$.taskTitle.setContent("<i>Swipe again to restore...</i>");
		}
		else {
			this.$.tasklistItem.removeClass("itemDeleting");
			this.$.taskTitle.setContent(data.title);	//+ " - " + data.sortPosition
		}
		this.$.taskCheck.setValue(data.completed);
	},
	listItemTap: function(inSender, inEvent) {
		if (!this.$.taskDetails.inEdit) {
			enyo.log("You tapped on row: " + this.data[inEvent.index].title + " which is currently complete: " + (this.data[inEvent.index].completed || "false"));
			if (inSender.kind == "enyo.Checkbox") {
				var newVal = !this.data[inEvent.index].completed;
				this.data[inEvent.index].completed = newVal;
				inSender.setValue(newVal);
				this.updateTaskFromList(this.data[inEvent.index]);
				if (this.data[inEvent.index].completed) {
					this.$.mySoundPlayer.soundCheck.Play();
				}
				else
					this.$.mySoundPlayer.soundUncheck.Play();
				return true;
			} else {
				enyo.log("Setting task details...");
				this.selectedTask = this.data[inEvent.index];
				this.$.taskDetails.taskGuid = this.data[inEvent.index].guid;
				this.$.taskDetails.taskTitle = this.data[inEvent.index].title || "";
				this.$.taskDetails.taskNotes = this.data[inEvent.index].notes || "";
				this.$.taskDetails.render();
			}
		} else {
			enyo.log("The active panel is " + this.$.contentPanels.getActive())
			if (this.$.contentPanels.getActive() == "app_mainView_taskDetails [checkmate.DetailViewer]") {
				enyo.log("Tap cancelled because detail is editing!");
				return true;
			} else {
				this.$.taskDetails.editCancelTap();
			}
		}
	},
	listReorderStart: function(inSender, inEvent) {
		enyo.warn("list is about to be re-ordered");
		var i = inEvent.index;
		if(!this.data[i]) {
			return;
		}
		if (this.$.taskDetails.inEdit)
		{
			enyo.warn("dragging while editing, but can't be cancelled");
			return;
		}
		this.$.reorderTitle.setContent(this.data[i].title);
		return true;
	},
	listReorderDone: function(inSender, inEvent) {
		if(!this.data[inEvent.reorderFrom] || !this.data[inEvent.reorderTo]) {
			return;
		}
		if (this.$.taskDetails.inEdit)
		{
			enyo.warn("Dragged while editing, but can't be cancelled");
			return;
		}
		var movedItem = enyo.clone(this.data[inEvent.reorderFrom]);
		var evictedItem = this.data[inEvent.reorderTo];

		if (movedItem.sortPosition != evictedItem.sortPosition) {
			enyo.warn("List has been reordered, old sortPos: " + movedItem.sortPosition + " swapping with " + evictedItem.sortPosition);
			this.data.splice(inEvent.reorderFrom,1);
			this.data.splice((inEvent.reorderTo),0,movedItem);
	
			newPos = 1;
			for (var i=this.data.length-1; i >= 0; i--) {
				this.data[i].sortPosition = newPos;
				newPos++;
			}
			this.$.list.reset();
			this.updateTaskFromList(this.data);
		} else {
			enyo.log("List resort did not result in any changes and will be ignored");
		}
	},
	listItemSwipeStart: function(inSender, inEvent) {
		enyo.warn("list item started swiping");
		var i = inEvent.index;
		if(!this.data[i]) {
			return;
		}
		if (this.$.taskDetails.inEdit)
		{
			enyo.log("swiping while editing!");
			return;
		}
		if (!this.$.taskDetails.inEdit) {
			this.$.swipeItem.removeClass("swipeInfo");
			this.$.swipeItem.removeClass("swipeDelete");
			this.$.swipeItem.removeClass("swipeUndo");
			if (this.data[i].sortPosition != -1) {
				if (inEvent.xDirection == 1) {
					enyo.log("show info");
					this.$.swipeTitle.setContent("<img src='assets/info.png' style='height:32px'>");
					this.$.swipeItem.addClass("swipeInfo");
				}
				else {
					enyo.log("show delete");
					this.$.swipeTitle.setContent("<img src='assets/delete.png' style='height:32px'>");
					this.$.swipeItem.addClass("swipeDelete");
				}
			} else {
				enyo.log("show undo");
				this.$.swipeTitle.setContent("<img src='assets/undo.png' style='height:32px'>");
				this.$.swipeItem.addClass("swipeUndo");
			}
			return true;
		}
	},
	listItemSwipeDone: function(inSender, inEvent) {
		enyo.log("item swipe has completed");
		var i = inEvent.index;
		if(!this.data[i]) {
			return;
		}
		if (this.$.taskDetails.inEdit)
		{
			enyo.log("swiping while editing!");
			return;
		}
		if (this.data[i].sortPosition != -1) {
			if (inEvent.xDirection == 1) {
				enyo.log("swipe for show/hide info panel")
				this.selectedTask = this.data[inEvent.index];
				//enyo.log("selected task is: " + this.selectedTask.guid);
				this.$.list.select(inEvent.index);
				
				this.$.taskDetails.taskTitle = this.data[inEvent.index].title || "";
				this.$.taskDetails.taskNotes = this.data[inEvent.index].notes || "";
				this.$.taskDetails.render();
				if (this.$.contentPanels.getActive() == "app_mainView_body [enyo.FittableRows]")
					this.$.contentPanels.setIndex(0);
				else
					this.$.contentPanels.setIndex(1);
			}
			else {
				enyo.log("swipe for item delete");
				this.$.list.deselect(inEvent.index);
				this.data[inEvent.index].oldSortPosition = this.data[inEvent.index].sortPosition;
				this.data[inEvent.index].sortPosition = "-1";
				this.$.list.refresh();
				window.setTimeout(this.doDelayedItemDelete.bind(this, this.data[inEvent.index]), 3000);
			}
		} else {
			enyo.log("swipe for cancel delete");
			this.$.swipeItem.removeClass("itemDeleting");
			this.data[inEvent.index].sortPosition = this.data[inEvent.index].oldSortPosition;
			this.selectedTask = this.data[inEvent.index];
			this.$.list.renderRow(i);
			this.cancelDeletes.push(this.data[inEvent.index].guid);
		}
	},
	doDelayedItemDelete: function(theItem) {
		if (this.cancelDeletes.indexOf(theItem.guid) != -1) {
			enyo.log("I will cancel the delete of the item with title: " + theItem.title);
			this.cancelDeletes.splice(this.cancelDeletes.indexOf(theItem.guid), 1);
		} else {
			enyo.log("I should now delete the item with title: " + theItem.title);
			//Don't trust previous index
			var itemToDelete = -1;
			for (var i=0;i<this.data.length;i++) {
				if (theItem.guid == this.data[i].guid)
				{
					enyo.log("current data length: " + this.data.length);
					delete this.data[i].oldSortPosition;
					itemToDelete = i;
					this.updateTaskFromList(this.data[i]);
					if (this.$.taskGuid == theItem.guid)
						this.$.taskDetails.reset();
					this.$.mySoundPlayer.soundDelete.Play();
				}
			}
			this.data.splice(itemToDelete, 1);
			this.$.list.setCount(this.data.length);
			this.$.list.refresh();
			enyo.log("after delete data length: " + this.data.length);
		}
	},
	updateTaskFromList: function(newItemData) {
		var self = this;
		this.newItemData = newItemData;
		this.$.myCheckmate.updateTask(newItemData);
	},
	updateTaskFromDetails: function(inSender, inEvent) {
		this.$.contentPanels.setIndex(1);
		
		//Determine if this is a task edit or create
		var foundTask = false
		if (this.selectedTask) {
			//edit
			for (var i=0;i<this.data.length;i++) {
				if (this.selectedTask.guid == this.data[i].guid)
				{
					this.data[i].title = this.$.taskDetails.taskTitle;
					this.data[i].notes = this.$.taskDetails.taskNotes;
					foundTask = this.data[i];
				}
			}
			this.selectedTask = null;
			this.$.list.refresh();
		}
		if (!foundTask && this.$.taskDetails.taskTitle != "") {
			//create
			foundTask = {
				guid: "new",
				title: this.$.taskDetails.taskTitle,
				notes: this.$.taskDetails.taskNotes,
				completed: false,
			}
		}
		//Perform the update on the server
		if(foundTask) {
			this.$.myCheckmate.updateTask(foundTask,
				function(inResponse) {	
					if (inResponse && inResponse.tasks) {
						//enyo.log("update task response! " + JSON.stringify(inResponse))
						this.data = inResponse.tasks;
						this.$.list.setCount(this.data.length);
						var selectIndex = -1;
						if (foundTask.guid == "new") {
							this.$.contentPanels.setIndex(1);
							this.selectedTask = null;
							this.$.taskDetails.taskTitle = "";
							this.$.taskDetails.taskNotes = "";
							this.$.taskDetails.render();
						}
						else {
							for (var i=0;i<this.data.length;i++) {
								if (foundTask.guid == this.data[i].guid)
									selectIndex = i;
							}
							this.$.list.select(selectIndex);
						}
					} else {
						this.handleAPIError(inResponse);	
					}
				}
			);
		}
		else {
			this.handleAPIError(inResponse);
		}
	},
	checkTasksEqual: function(task1, task2) {
		isEqual = true;
		if (task1.guid != task2.guid)
			isEqual = false;
		if (task1.title != task2.title)
			isEqual = false;
		if (task1.notes != task2.notes)
			isEqual = false;
		if (task1.completed != task2.completed)
			isEqual = false;
		if (task1.sortPosition != task2.sortPosition)
			isEqual = false;
		return isEqual;
	},
	/* API Functions */
	loadTaskList: function() {
		enyo.log("Doing thorough update!");
		window.clearInterval(updateInt);
		this.startSpinner();
		this.$.myCheckmate.getTasks();
	},
	doBackgroundRefresh: function() {
		enyo.log("Doing background update!");
		window.clearInterval(updateInt);
		this.startSpinner();
		this.$.myCheckmate.processQueue();
	},
	startSpinner: function() {
		this.$.buttonUpdate.addClass("active");
		this.$.imgSync.setAttribute("src", "assets/sync-spin.gif");
		this.$.buttonUpdate.disabled = true;
	},
	stopSpinner: function() {
		window.setTimeout(function() {
			this.$.buttonUpdate.removeClass("active");
			this.$.imgSync.setAttribute("src", "assets/sync.png");
			this.$.buttonUpdate.disabled = true;
		}.bind(this), 1200);
	},
	backoffToOffline: function(reason) {
		if (reason) {
			enyo.warn("Backing off to offline, error count: " + this.errorCount + " because: " + reason);
			window.clearInterval(updateInt);
			updateInt = window.setInterval(this.doBackgroundRefresh.bind(this), updateRate);
		}
		if (this.errorCount >= 3) {
			enyo.error("Error count exceeded back-off threshold, going offline");
			this.showAsOffline();
		}
	},
	showAsOffline: function() {
		window.clearInterval(updateInt);
		this.stopSpinner();
		window.setTimeout(function() {
			this.$.buttonUpdate.removeClass("active");
			this.$.imgSync.setAttribute("src", "assets/offline.png");
			this.$.buttonUpdate.disabled = false;
		}.bind(this), 1800);
		this.errorCount = 0;
	},
	handlePostSuccess: function(inRequest, inResponse) {
		if (inResponse && inResponse.tasks) {
			for (var i=0;i<this.data.length;i++) {
				if (this.selectedTask && this.selectedTask.guid == this.data[i].guid)
					this.$.list.select(i);
			}
			this.loadTaskList();
		} else {
			this.handleAPIError(inResponse);
		}
	},
	handlePostError: function(inRequest, inResponse){
		enyo.warn("Task list update error occurred!");
		this.handleAPIError(inResponse);
		this.stopSpinner();
	},
	handleRefreshSuccess: function(inRequest, inResponse) {
		this.stopSpinner();
		
		if (inResponse && inResponse.tasks) {
			//Check if the list length has changed
			isDirty = false;
			if (inResponse.tasks.length != this.data.length) {
				enyo.log("List length has changed, the list needs to be redrawn.");
				isDirty = true;
			}
			knownGuids = [];
			for (var i=0;i<this.data.length;i++) {
				knownGuids.push(this.data[i].guid);
			}
			//Update individual tasks if we can
			for (var i=0;i<inResponse.tasks.length;i++) {
				if (isDirty)
					break;

				//Check if the new list has items we don't know about
				if (knownGuids.indexOf(inResponse.tasks[i].guid) == -1) {
					enyo.log("List items have changed, the list needs to be redrawn.");
					isDirty = true;
				}
				if (!isDirty && !this.checkTasksEqual(this.data[i], inResponse.tasks[i])) {
					enyo.log("Row " + i + " has changed and needs to be updated!");
					enyo.log("Current: " + JSON.stringify(this.data[i]));
					enyo.log("New:     " + JSON.stringify(inResponse.tasks[i]));
					this.data[i] = inResponse.tasks[i];
					this.$.list.renderRow(i);
					if (this.data[i].sortPosition != inResponse.tasks[i].sortPosition) {
						enyo.log("Row " + i + " needs to be re-positioned");
					}
				}
			}
			//Update the whole list if we can't
			if (isDirty){	 //TODO: Can we make this even more individual, instead of throwing out the whole list?
				this.data = inResponse.tasks;
				this.$.list.setCount(this.data.length);
				this.$.list.reset();
			}
			
			//Schedule next update
			enyo.log("Refresh success, scheduling next refresh");
			window.clearInterval(updateInt);
			updateInt = window.setInterval(this.doBackgroundRefresh.bind(this), updateRate);
		} else {
			enyo.log("Unknown refresh response: " + inResponse);
			this.handleAPIError(inResponse);
		}
	}, 
	handleRefreshError: function(inResponse) {
		enyo.warn("Task list refresh error occurred!");
		this.handleAPIError(inResponse);
		this.stopSpinner();
	},
	/* UI Controls */
	handleAPIError: function(errorResponse) {
		this.errorCount++;
		if (errorResponse) {
			enyo.warn("An API called resulted in an error: " + JSON.stringify(errorResponse));
			if (errorResponse.failed) {
				if (errorResponse.xhrResponse && errorResponse.xhrResponse.body) {
					this.showModal(errorResponse.xhrResponse.body);
					this.showAsOffline();
				}
				else {
					if (errorResponse.xhrResponse.status) {
						this.backoffToOffline("API call with error code: " + errorResponse.xhrResponse.status);
					}
					else {
						this.backoffToOffline("API call with no status");
					}
				}
			}
			else if (errorResponse.error) {
				this.showModal("<b>Error</b><br><br>" + errorResponse.error);
				this.showAsOffline();
			}
			else {
				this.showModal("An error occured during an API call. Check your server settings and network connection. If you are self-hosting, make sure you have CORS setup correctly.");
				this.showAsOffline();
			}	
		} else {
			enyo.warn("An API call resulted in an unknown error. Check your server settings and network connection. If you are self-hosting, make sure you have CORS setup correctly.");
			this.backoffToOffline("Unknown Error");
		}
	},
	showModalFromLogin: function() {
		this.showModal(this.$.signinPanel.messageToShow);
	},
	showModal: function(message) {
		this.$.popupMessage.setContent(message);
		this.$.popupModal.setShowing(true);
	},
	closeModal: function(inSender, inEvent) {
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
			enyo.log("detail panel opened " + JSON.stringify(this.selectedTask));
			if (!this.selectedTask || this.selectedTask.title == "")
			{
				enyo.log("no selected task, creating a new one")
				this.$.taskDetails.newTask();
			} else {
				enyo.log("user wants to edit task");
			}
		}
		else {
			enyo.log("detail panel closed");
			this.$.taskDetails.render();
			if (this.$.taskDetails.inEdit) {
				enyo.log("closed while in edit, cancelling")
				this.$.taskDetails.editCancelTap();
			}
		}
	}
});
