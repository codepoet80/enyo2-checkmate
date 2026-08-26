enyo.kind({
	name: "checkmate.Signin",
	kind: "FittableRows",
	classes: "taskDetailPane",
	narrowFit: true,
	messageToShow: "",
	//Set once an account has been minted this session, so a second tap on Create
	//	can't quietly strand the first set of credentials on the server.
	newAccount: false,
	published: {
		move: "",
		grandmaster: "",
		urlBase: "checkmate.wosa.link",
		insecure: false,
		useCustomServer: false,
		customServer:""
	},
	events: {
		onLogin: "",
		onMessage: ""
	},
	components: [
		{kind: "onyx.Toolbar", name:"taskAction", classes:"detailToolbarTop", components: [
            {name:"toolbarTitle", content:"Check Mate - Your To Do List Anywhere!"}
        ]},
		{kind: "enyo.Scroller", horizontal:"hidden", fit:true, components:[
			{name: "labelTOS", classes:"taskDetailLabel", ontap:"activateTOSDrawer", components: [
				{tag: "img", classes:"expanderIcon", attributes: {src: "assets/maximize.png"}},			
				{content: "Terms of Service"}
			]},
			
			{kind: "enyo.Drawer", name:"drawerTOS", classes: "", open:false, components: [
					{name: "textTOS", classes:"finePrint", content: "", allowHtml: true}
			]},

			{kind: "enyo.Drawer", name:"drawerNewAccount", open:false, classes: "darkDetail taskDetailLabel", components: [
				{classes:"rowSeperator" },
				{name: "textNewAccountIntro", classes: "darkDetailLabel", content: "Your account is ready. Write these down before you go on -- they are the only way back in, they can't be changed, and this is the only time they're shown."},
				{classes:"rowSeperator" },
				{name: "textNewMoveLabel", classes: "darkDetailLabel", content: "Your Move:"},
				//The service picks both, out of its own word lists. setContent()
				//	escapes unless allowHtml is set, so they land as text.
				{name: "textNewMove", classes: "credentialValue", content: ""},
				{name: "textNewGrandmasterLabel", classes: "darkDetailLabel", content: "Grandmaster:"},
				{name: "textNewGrandmaster", classes: "credentialValue", content: ""},
				{classes:"rowSeperator" },
				{name: "textNewAccountHint", classes: "darkDetailLabel finePrint", content: "They aren't case sensitive. Don't share them publicly. They're already filled in below -- tap Log In once you've written them down."},
				{classes:"rowSeperator" }
			]},

			{name: "textMove", classes:"taskDetailLabel", content: "Your Move:"},
			{kind: "enyo.Input", name: "inputMove", classes:"taskDetailEntry", value: ""},
			{name: "textGrandmaster", classes:"taskDetailLabel", content: "Grandmaster:"},
			{kind: "enyo.Input", type: "password", name: "inputGrandmaster", classes:"taskDetailEntry", value: ""},

			{name: "labelConfig", classes:"taskDetailLabel", ontap:"activateConfigDrawer", components: [
				{tag: "img", classes:"expanderIcon", attributes: {src: "assets/maximize.png"}},			
				{content: "Server Configuration"}
			]},
			{kind: "enyo.Drawer", name:"drawerServer", open:false, classes: "darkDetail taskDetailLabel", components: [
				{classes:"rowSeperator" },
				{kind: "enyo.Checkbox", classes: "darkDetailLabel", name:"checkInsecure", content: "Use Insecure Connection (HTTP)" },
				{classes:"rowSeperator" },
				{kind: "enyo.Checkbox", classes: "darkDetailLabel", name:"checkCustomServer", content: "Use Self Host Server", onchange: "checkboxChanged"},
				{classes:"rowSeperator" },
				{name: "textServer", classes: "darkDetailLabel", content: "Self Host Server:"},
				{kind: "enyo.Input", classes:"darkDetailEntry", name: "inputCustomServer", value: ""}
			]},
			{classes:"spacer"},

			{classes:"finePrint", allowHtml:true, content: "Check Mate is open source software, and contains no tracking or analytics. However, if you're using the default shared service, there are privacy implications. If you self-host the service, your data never leaves your control. To find out more about Check Mate, visit the <a href='http://www.github.com/codepoet80/enyo2-checkmate'>author's GitHub</a>." },
			{classes:"spacer" }
		]},

		{kind: "onyx.Toolbar", layoutKind: "FittableColumnsLayout", classes: "detailToolbarBottom", noStretch: true, components: [
			{kind: "onyx.Button", name: "buttonCreate", content: "Create", ontap: "tapCreate" },
			{kind: "onyx.Button", name: "buttonLogin", classes:"buttonRight", content: "Log In", ontap: "tapLogin" }
		]},

		//Creating an account is the one irreversible thing this screen does, so
		//	it asks first. Sits outside the scroller, like the main view's popup.
		{kind: "enyo.Popup", name: "popupAgree", modal: true, autoDismiss: false, centered: true, classes: "popup", components: [
			{name: "popupAgreeMessage", allowHtml: true, content: ""},
			{classes:"spacer"},
			{kind: "enyo.Button", name: "buttonAgreeCancel", content: "Cancel", ontap: "cancelCreate"},
			{kind: "enyo.Button", name: "buttonAgreeConfirm", classes: "buttonRight", content: "I Agree", ontap: "confirmCreate"}
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
	//Whatever is in the server drawer right now, not whatever was in the cookie
	//	when this panel was built. Without this, ticking "Use Self Host Server"
	//	and then tapping Create minted the account on the shared service instead.
	applyServerConfig: function() {
		this.setInsecure(this.$.checkInsecure.getValue());
		this.setUseCustomServer(this.$.checkCustomServer.getValue());
		this.setCustomServer(this.$.inputCustomServer.getValue());
		if (this.api) {
			this.api.setInsecure(this.getInsecure());
			this.api.setUseCustomServer(this.getUseCustomServer());
			this.api.setCustomServer(this.getCustomServer());
		}
	},
	//Where an account would be created, for the benefit of error messages. The
	//	config cookie doesn't exist on a first run, so this can't read through
	//	this.serverConfig -- which is exactly what the old "go use a browser"
	//	message did, and it threw before it could be shown.
	describeServer: function() {
		if (this.getUseCustomServer() && this.getCustomServer() != "") {
			return this.getCustomServer();
		}
		return this.getUrlBase();
	},
	tapCreate: function() {
		if (this.newAccount) {
			this.messageToShow = "You've already created an account. Write down the move and grandmaster shown above, then tap Log In.";
			this.doMessage();
			return;
		}
		this.applyServerConfig();
		//Put the terms in front of the user before asking them to agree to them.
		this.$.drawerTOS.setOpen(true);
		this.$.popupAgreeMessage.setContent("A new account will be created on <b>" + this.describeServer() + "</b>, which means you agree to the Terms of Service shown behind this message.<br><br>The service picks your move and grandmaster for you. They can't be changed afterwards, and they're shown only once.");
		this.$.popupAgree.setShowing(true);
	},
	cancelCreate: function() {
		this.$.popupAgree.setShowing(false);
	},
	confirmCreate: function() {
		this.$.popupAgree.setShowing(false);
		this.$.buttonCreate.setDisabled(true);
		this.$.buttonCreate.setContent("Creating...");
		var self = this;
		this.api.getNewCredentials(
			function(inResponse) {
				self.handleNewAccount(inResponse);
			},
			function(detail) {
				self.handleNewAccountError(detail);
			}
		);
	},
	handleNewAccount: function(inResponse) {
		//The service answers 200 with an error body for some failures, so a
		//	response is not the same thing as a pair of credentials.
		if (!inResponse || !inResponse.move || !inResponse.grandmaster) {
			this.handleNewAccountError(inResponse && inResponse.error ? inResponse.error : null);
			return;
		}
		this.newAccount = true;
		this.$.buttonCreate.setContent("Created");
		this.$.textNewMove.setContent(inResponse.move);
		this.$.textNewGrandmaster.setContent(inResponse.grandmaster);
		this.$.drawerNewAccount.setOpen(true);
		//Fill the log-in fields so the user only has to tap Log In. The
		//	grandmaster field is a password input and so masks what it holds,
		//	which is why the drawer above shows both in the clear -- this is the
		//	only chance the user gets to copy them down.
		this.$.inputMove.setValue(inResponse.move);
		this.$.inputGrandmaster.setValue(inResponse.grandmaster);
	},
	handleNewAccountError: function(detail) {
		this.$.buttonCreate.setDisabled(false);
		this.$.buttonCreate.setContent("Create");
		this.messageToShow = "<b>Your account could not be created.</b><br><br>" +
			(detail || "The service may be down or unreachable. Check your network connection, and your server settings if you're self-hosting.");
		this.doMessage();
	},
	tapLogin: function() {
		this.move = this.$.inputMove.getValue();
		this.grandmaster = this.$.inputGrandmaster.getValue();
		if (this.move != "" && this.grandmaster != "") {
			this.applyServerConfig();
			this.doLogin();
		} else {
			this.messageToShow = "Please enter your chess move and grandmaster to log in. If you don't have an account yet, tap Create and one will be made for you.";
			this.doMessage();
		}
	}
});