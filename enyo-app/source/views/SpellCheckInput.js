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
	//Go through setAttribute(), which records the value on the control as well as
	//	on the node, so a re-render reapplies it. This used to write straight to
	//	the DOM node and bail out when there wasn't one yet, which left the kind's
	//	own contenteditable:"false" as the control's idea of the truth. The two
	//	could then disagree in both directions -- and because setDisabled() is a
	//	published setter, it only calls this on an actual change, so nothing ever
	//	put them back in step. A field left editable by an earlier edit stayed
	//	editable while the model said otherwise, which is a task you can type into
	//	with no Save button to be seen.
	disabledChanged: function() {
		this.setAttribute("contenteditable", this.disabled ? "false" : "true");
		this.addRemoveClass("spell-check-disabled", this.disabled);
	},
	//Force the DOM to match, whatever the model already says. setDisabled() is
	//	the wrong tool when the node is the thing that's out of step, because it
	//	does nothing at all when the value hasn't changed.
	syncDisabled: function(disabled) {
		this.disabled = !!disabled;
		this.disabledChanged();
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
