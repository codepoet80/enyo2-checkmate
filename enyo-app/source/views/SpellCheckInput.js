enyo.kind({
	name: "checkmate.SpellCheckInput",
	tag: "div",
	attributes: {
		contenteditable: "false",
		spellcheck:      "true",
		autocorrect:     "on",
		autocapitalize:  "sentence",
		tabindex:        "0"
	},
	published: {
		disabled:   true,
		singleLine: false
	},
	handlers: {
		onkeydown: "handleKeyDown"
	},
	getValue: function() {
		var node = this.hasNode();
		if (!node) { return ""; }
		var t = (node.innerText !== undefined) ? node.innerText : node.textContent;
		return t.replace(/\n$/, "");
	},
	setValue: function(val) {
		var node = this.hasNode();
		if (!node) { return; }
		node.innerHTML = "";
		if (val) { node.innerText = val; }
	},
	disabledChanged: function() {
		var node = this.hasNode();
		if (!node) { return; }
		if (this.disabled) {
			node.setAttribute("contenteditable", "false");
			this.addClass("spell-check-disabled");
		} else {
			node.setAttribute("contenteditable", "true");
			this.removeClass("spell-check-disabled");
		}
	},
	focus: function() {
		var node = this.hasNode();
		if (node) { node.focus(); }
	},
	handleKeyDown: function(sender, event) {
		if (this.singleLine && event.keyCode === 13) {
			event.preventDefault();
			return true;
		}
	}
});
