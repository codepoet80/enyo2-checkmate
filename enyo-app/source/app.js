/**
	Define and instantiate your enyo.Application kind in this file.  Note,
	application rendering should be deferred until DOM is ready by wrapping
	it in a call to enyo.ready().
*/

enyo.kind({
	name: "checkmate.Application",
	kind: "enyo.Application",
	view: "checkmate.MainView"
});

enyo.ready(function () {
	new checkmate.Application({name: "app"});
});
