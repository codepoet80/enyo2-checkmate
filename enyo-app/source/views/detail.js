enyo.kind({
	name: "checkmate.DetailViewer",
	kind: "FittableRows",
	classes: "taskDetailPane",
	narrowFit: true,
	published: {
		taskGuid: "",
		taskTitle: "",
		taskNotes: "",
		inEdit: false,
	},
	events: {
		onHideTaskDetails: "",
		onSave: ""
	},
	components: [
		{kind: "onyx.Toolbar", name:"taskAction", classes:"detailToolbarTop", components: [
            {name:"toolbarTitle", name:"taskDetailTitle", content:"Task Detail"},
            {kind:"onyx.Grabber", classes: "responsiveGrabber", showing:true },
        ]},
		{kind: "enyo.Scroller", horizontal:"hidden", classes:"", fit:true, components:[
			{name: "labelTaskTitle", classes:"taskDetailLabel", content: "Title"},
			{kind: "enyo.Input", name: "taskTitle", classes:"taskDetailEntry", disabled: true, value: "", onchange: "inputChanged", oninput: "inputOccurred"},
			{name: "labeltaskNotes", classes:"taskDetailLabel", content: "Notes" },
			{kind: "enyo.TextArea", name: "taskNotes", classes:"taskDetailEntry taskDetailEntryBottom", disabled: true, value: "", onchange: "inputChanged", oninput: "inputOccurred"},
		]},
		{kind: "onyx.Toolbar", layoutKind: "FittableColumnsLayout", classes: "detailToolbarBottom", noStretch: true, components: [
			{kind: "onyx.Button", name: "taskEditCancel", content: "Edit", ontap: "editCancelTap"},
            {kind: 'onyx.Grabber', classes: "responsiveGrabber", showing:true},
			{kind: "onyx.Button", name: "taskSave", classes:"buttonRight", content: "Save", ontap: "saveTap", showing:false },
		]}
	],
	taskTitleChanged: function() {
		this.$.taskTitle.setValue(this.getTaskTitle());
	},
	taskNotesChanged: function() {
		this.$.taskNotes.setValue(this.getTaskNotes());
	},
	render: function() {
		this.$.taskTitle.setValue(this.getTaskTitle());
		this.$.taskNotes.setValue(this.getTaskNotes());
		
		this.$.taskTitle.setDisabled(!this.inEdit);
		this.$.taskNotes.setDisabled(!this.inEdit);
		this.$.taskSave.setShowing(this.inEdit);
		if (this.inEdit) {
			this.$.taskEditCancel.setContent("Cancel");
		} else {
			if (this.getTaskTitle() != "")
				this.$.taskEditCancel.setContent("Edit");
			else
				this.$.taskEditCancel.setContent("New");
		}
	},
	reset: function() {
		this.inEdit = false;
		this.$.taskDetailTitle.setContent("Task Detail");
		this.taskTitle = "";
		this.taskNotes = "";
		this.render();
	},
	newTask: function() {
		this.reset();
		this.inEdit = true;
		this.render();
		this.$.taskDetailTitle.setContent("New Task");
		this.$.taskTitle.focus();
	},
	editCancelTap: function() {
		this.$.taskDetailTitle.setContent("Task Detail");
		this.inEdit = !this.inEdit;
		this.render();
	},
	saveTap: function() {
		this.taskTitle = this.$.taskTitle.getValue();
		this.taskNotes = this.$.taskNotes.getValue();
		this.$.taskDetailTitle.setContent("Task Detail");
		enyo.log("raising save event!");
		this.doSave();
		this.editCancelTap();
	}
});