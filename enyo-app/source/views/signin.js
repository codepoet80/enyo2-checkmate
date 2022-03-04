enyo.kind({
	name: "checkmate.Signin",
	kind: "FittableRows",
	classes: "taskDetailPane",
	narrowFit: true,
	messageToShow: "",
	published: {
		move: "",
		grandmaster: "",
		serverConfig: { 
			insecure: false,
			useCustomServer: false,
			customServer:""
		},
	},
	events: {
		onLogin: "",
		onCreate: "",
		onMessage: "",
	},
	components: [
		{kind: "onyx.Toolbar", name:"taskAction", classes:"detailToolbarTop", components: [
            {name:"toolbarTitle", content:"Check Mate - Your To Do List Anywhere!"},
        ]},
		{kind: "enyo.Scroller", horizontal:"hidden", fit:true, components:[
			{name: "labelTOS", classes:"taskDetailLabel", ontap:"activateTOSDrawer", components: [
				{tag: "img", classes:"expanderIcon", attributes: {src: "assets/maximize.png"}},			
				{content: "Terms of Service"}
			]},
			
			{name: "drawer", kind: "enyo.Drawer", name:"drawerTOS", classes: "", open:false, components: [
					{name: "textTOS", classes:"finePrint", content: "", allowHtml: true},
			]},
			{name: "textMove", classes:"taskDetailLabel", content: "Your Move:"},
			{kind: "enyo.Input", name: "inputMove", classes:"taskDetailEntry", value: "",},
			{name: "textGrandmaster", classes:"taskDetailLabel", content: "Grandmaster:"},
			{kind: "enyo.Input", name: "inputGrandmaster", classes:"taskDetailEntry", value: "",},

			{name: "labelConfig", classes:"taskDetailLabel", ontap:"activateConfigDrawer", components: [
				{tag: "img", classes:"expanderIcon", attributes: {src: "assets/maximize.png"}},			
				{content: "Server Configuration"}
			]},
			{name: "drawer", kind: "enyo.Drawer", name:"drawerServer", open:false, classes: "darkDetail taskDetailLabel", components: [
				{classes:"rowSeperator" },
				{kind: "enyo.Checkbox", classes: "darkDetailLabel", name:"checkInsecure", content: "Use Insecure Connection (HTTP)" },
				{classes:"rowSeperator" },
				{kind: "enyo.Checkbox", classes: "darkDetailLabel", name:"checkCustomServer", content: "Use Self Host Server", onchange: "checkboxChanged"},
				{classes:"rowSeperator" },
				{name: "textServer", classes: "darkDetailLabel", content: "Self Host Server:"},
				{kind: "enyo.Input", classes:"darkDetailEntry", name: "inputCustomServer", value: ""},
			]},
			{classes:"spacer", },

			{classes:"spacer", classes:"finePrint", allowHtml:true, content: "Check Mate is open source software, and contains no tracking or analytics. However, if you're using the default shared service, there are privacy implications. If you self-host the service, your data never leaves your control. To find out more about Check Mate, visit the <a href='http://www.github.com/codepoet80/enyo2-checkmate'>author's GitHub</a>." },
			{classes:"spacer" },
		]},

		{kind: "onyx.Toolbar", layoutKind: "FittableColumnsLayout", classes: "detailToolbarBottom", noStretch: true, components: [
			{kind: "onyx.Button", name: "buttonCreate", content: "Create", ontap: "tapCreate" },
			{kind: "onyx.Button", name: "buttonLogin", classes:"buttonRight", content: "Login", ontap: "tapLogin" },
		]}
	],
	rendered: enyo.inherit(function(sup) {
		return function() {
			var self = this;
			self.api = new checkmate.api(this.serverConfig);
			self.api.getTnC(
				function(inResponse) {
					self.$.textTOS.setContent(inResponse);
					self.$.drawerTOS.setOpen(true);
				}, function() {
					enyo.log("error hit");
					self.messageToShow = "An error occurred retreiving Terms of Service. The service may be down or unreachable.";
					self.doMessage();
				}
			);
		};	
	}),
	checkboxChanged: function() {
		this.$.inputCustomServer.setDisabled(false);
	},
	activateTOSDrawer: function() {
		this.$.drawerTOS.setOpen(!this.$.drawerTOS.open);
	},
	activateConfigDrawer: function() {
		this.$.drawerServer.setOpen(!this.$.drawerServer.open);
	},
	tapCreate: function() {
		this.messageToShow = "I don't have this functionality built into the app yet, but you can create an account in your web browser at <a href='https://checkmate.webosarchive.com/agreement.php'>checkmate.webosarchive.com</a>.";
		this.doMessage();
	},
	tapLogin: function() {
		this.move = this.$.inputMove.getValue();
		this.grandmaster = this.$.inputGrandmaster.getValue();
		if (this.move != "" && this.grandmaster != "") {
			this.serverConfig.insecure = this.$.checkInsecure.getValue();
			this.serverConfig.useCustomServer = this.$.checkCustomServer.getValue();
			this.serverConfig.customServer = this.$.inputCustomServer.getValue();
			this.doLogin();
		} else {
			this.messageToShow = "Please enter your chess move and grandmaster to log-in. If you don't have an account setup yet, you can create an account in your web browser at <a href='https://checkmate.webosarchive.com/agreement.php'>checkmate.webosarchive.com</a>.";
			this.doMessage();
		}
	}
});