/*
	Shown in place of Log Out once credentials live on the user's webOS Account.

	Logging out would be the wrong offer there: the next launch on this device --
	or any other webOS device on the same account -- would simply pull them back.
	So the toolbar button becomes a padlock, and this is what it opens: what your
	move is, a peek at your grandmaster, and the one control that genuinely ends
	it, which clears the account copy and this device together.
*/
enyo.kind({
	name: "checkmate.CredentialViewer",
	kind: "FittableRows",
	classes: "taskDetailPane",
	narrowFit: true,
	published: {
		move: "",
		grandmaster: "",
		accountName: ""
	},
	//The grandmaster is a password. It starts hidden and is revealed only for as
	//	long as the user holds the eye open.
	revealed: false,
	events: {
		onCloseCredentials: "",
		onForgetCredentials: ""
	},
	components: [
		{kind: "onyx.Toolbar", classes:"detailToolbarTop", components: [
			{name:"credentialTitle", content:"Your Credentials"},
			{kind:"onyx.Grabber", classes: "responsiveGrabber", showing:true }
		]},
		{kind: "enyo.Scroller", horizontal:"hidden", fit:true, components:[
			{classes:"spacer"},
			{name: "textAccount", classes:"credentialNote", content: ""},

			{name: "labelMove", classes:"taskDetailLabel", content: "Your Move:"},
			{name: "textMove", classes:"taskDetailLabel credentialValue", content: ""},

			//The text has to be a span, or Enyo's default div pushes the eye onto
			//	a line of its own.
			{name: "labelGrandmaster", classes:"taskDetailLabel", components: [
				{tag: "span", content: "Grandmaster:"},
				{tag: "img", name: "imgReveal", classes:"revealIcon", ontap: "toggleReveal",
					attributes: {src: "assets/reveal.png", alt: "Show"}}
			]},
			{name: "textGrandmaster", classes:"taskDetailLabel credentialValue", ontap: "toggleReveal", content: ""},

			{classes:"spacer"},
			{classes:"credentialNote", content: "These are saved to your webOS Account, so any webOS device you sign in on picks up this list without asking you to log in again."},
			{classes:"spacer"},
			{classes:"credentialNote", content: "Forgetting them clears this device and your webOS Account together. Your tasks are not touched, but you will need your move and grandmaster to get back in -- so write them down first."},
			{classes:"spacer"}
		]},
		{kind: "onyx.Toolbar", layoutKind: "FittableColumnsLayout", classes: "detailToolbarBottom", noStretch: true, components: [
			{kind: "onyx.Button", name: "buttonForget", content: "Forget", ontap: "tapForget" },
			{kind: 'onyx.Grabber', classes: "responsiveGrabber", showing:true},
			{kind: "onyx.Button", name: "buttonClose", classes:"buttonRight", content: "Done", ontap: "tapClose" }
		]},

		{kind: "enyo.Popup", name: "popupConfirm", modal: true, autoDismiss: false, centered: true, classes: "popup", components: [
			{name: "popupConfirmMessage", allowHtml: true, content: ""},
			{classes:"spacer"},
			{kind: "enyo.Button", name: "buttonForgetCancel", content: "Keep", ontap: "cancelForget"},
			{kind: "enyo.Button", name: "buttonForgetConfirm", classes: "buttonRight", content: "Forget", ontap: "confirmForget"}
		]}
	],
	//The published setters fire before the controls exist on a first render, so
	//	the display is driven from one place that is safe to call at any time.
	moveChanged: function() {
		this.refresh();
	},
	grandmasterChanged: function() {
		this.refresh();
	},
	accountNameChanged: function() {
		this.refresh();
	},
	rendered: enyo.inherit(function(sup) {
		return function() {
			sup.apply(this, arguments);
			this.refresh();
		};
	}),
	refresh: function() {
		if (!this.$ || !this.$.textMove) {
			return;
		}
		this.$.textMove.setContent(this.getMove() || "");
		this.$.textGrandmaster.setContent(this.revealed ? (this.getGrandmaster() || "") : this.maskGrandmaster());
		this.$.imgReveal.setAttribute("src", this.revealed ? "assets/hide.png" : "assets/reveal.png");
		this.$.imgReveal.setAttribute("alt", this.revealed ? "Hide" : "Show");
		var name = this.getAccountName();
		this.$.textAccount.setContent(name
			? "Saved to your webOS Account (" + name + ")."
			: "Saved to your webOS Account.");
	},
	//Same length as the real thing, so the user can see there is something there
	//	without it being readable over a shoulder.
	maskGrandmaster: function() {
		var value = this.getGrandmaster() || "";
		var masked = "";
		for (var i = 0; i < value.length; i++) {
			masked += "•";
		}
		return masked;
	},
	toggleReveal: function() {
		this.revealed = !this.revealed;
		this.refresh();
		return true;
	},
	tapClose: function() {
		//Never leave it uncovered for whoever opens this next.
		this.revealed = false;
		this.refresh();
		this.doCloseCredentials();
		return true;
	},
	tapForget: function() {
		this.$.popupConfirmMessage.setContent("Forget these credentials on this device <b>and</b> on your webOS Account?<br><br>Your tasks are not deleted, but you will need your move and grandmaster to get back to them.");
		this.$.popupConfirm.setShowing(true);
		return true;
	},
	cancelForget: function() {
		this.$.popupConfirm.setShowing(false);
		return true;
	},
	confirmForget: function() {
		this.$.popupConfirm.setShowing(false);
		this.revealed = false;
		this.doForgetCredentials();
		return true;
	}
});
