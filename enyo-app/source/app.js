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
	//A hook for the handful of places where webOS needs slightly different
	//	metrics from a modern browser. Enyo knows the platform but doesn't put it
	//	on the body, and PalmSystem covers builds where enyo.platform doesn't.
	if ((enyo.platform && enyo.platform.webos) || typeof window.PalmSystem !== "undefined") {
		enyo.dom.addBodyClass("on-webos");
	}
	//Asynchronous, and only a fallback for when the bundle wasn't stamped, so
	//	nothing waits on it.
	BuildInfo.loadAppInfo();
	new checkmate.Application({name: "app"});
});
