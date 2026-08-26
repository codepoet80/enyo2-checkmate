/*
	Build identity, for answering "which build am I actually running?"

	`stamp` is a sentinel that build.sh rewrites inside the deployed bundle, so a
	built app reports the version from appinfo.json plus its build number. If it
	still starts with an underscore the bundle was never stamped, which means the
	app is running unbuilt from source (debug.html or grunt serve) -- itself worth
	knowing rather than hiding.
*/
BuildInfo = {

	stamp: "__CHECKMATE_BUILD__",

	//Filled in by loadAppInfo() from the appinfo.json every build ships.
	appVersion: null,

	//The unstamped sentinel is the only value that begins with an underscore; a
	//	stamped one always begins with a version digit. Deliberately not a
	//	substring comparison against the sentinel text, which build.sh would
	//	rewrite too.
	isStamped: function() {
		return this.stamp.charAt(0) !== "_";
	},

	//Read the version straight out of appinfo.json, which every target ships
	//	alongside the bundle. The stamp is still preferred where it exists,
	//	because it carries the build number too and that is the thing that
	//	answers "did my deploy actually land" -- appinfo.json only ever says
	//	2.4.0, however many times that has been rebuilt. But when the stamp is
	//	missing, reporting the real version beats claiming the app is unbuilt.
	loadAppInfo: function() {
		var self = this;
		try {
			var xhr = new XMLHttpRequest();
			xhr.open("GET", "appinfo.json", true);
			xhr.onreadystatechange = function() {
				if (xhr.readyState !== 4) {
					return;
				}
				//A webOS app runs from file://, where a successful read reports
				//	status 0 rather than 200.
				var ok = (xhr.status === 0 && xhr.responseText) ||
					(xhr.status >= 200 && xhr.status < 300);
				if (!ok) {
					return;
				}
				try {
					var info = JSON.parse(xhr.responseText);
					if (info && info.version) {
						self.appVersion = info.version;
					}
				} catch (err) {
					//Not readable; getVersion() falls back on its own.
				}
			};
			xhr.send(null);
		} catch (err) {
			//No XHR, or blocked. Nothing to report from here.
		}
	},

	getVersion: function() {
		if (this.isStamped()) {
			return this.stamp;
		}
		if (this.appVersion) {
			return this.appVersion + " (unstamped build)";
		}
		return "unbuilt (running from source)";
	},

	//Short summary of whatever Enyo managed to detect, e.g. "webos 3.0.5" or
	//	"chrome 140, touch". Enyo sets only the keys that apply.
	getPlatform: function() {
		var parts = [];
		if (typeof enyo !== "undefined" && enyo.platform) {
			for (var key in enyo.platform) {
				if (enyo.platform.hasOwnProperty(key) && enyo.platform[key]) {
					if (enyo.platform[key] === true) {
						parts.push(key);
					} else {
						parts.push(key + " " + enyo.platform[key]);
					}
				}
			}
		}
		return parts.length ? parts.join(", ") : "unknown";
	},

	//Whether this is running as an installed PWA rather than a browser tab. The
	//	iOS-specific navigator.standalone predates the media query, and neither
	//	exists on the old webOS browser, hence the guards.
	getDisplayMode: function() {
		try {
			if (typeof navigator !== "undefined" && navigator.standalone) {
				return "standalone (iOS)";
			}
			if (typeof window !== "undefined" && window.matchMedia) {
				if (window.matchMedia("(display-mode: standalone)").matches) {
					return "standalone";
				}
				if (window.matchMedia("(display-mode: fullscreen)").matches) {
					return "fullscreen";
				}
			}
		} catch (err) {
			return "unknown";
		}
		return "browser";
	},

	//Angle brackets would be eaten by the service's strip_tags(), and the notes
	//	column rejects anything over 1000 characters outright, so keep the note
	//	inside both limits rather than having the write silently rejected.
	sanitize: function(text) {
		var clean = String(text).replace(/[<>]/g, "");
		return (clean.length > 220) ? clean.substring(0, 217) + "..." : clean;
	},

	describe: function() {
		var lines = [];
		lines.push("App build:      " + this.sanitize(this.getVersion()));
		lines.push("Display mode:   " + this.sanitize(this.getDisplayMode()));
		lines.push("Platform:       " + this.sanitize(this.getPlatform()));
		lines.push("Checked:        " + this.sanitize(new Date().toString()));
		return lines.join("\n");
	}
};
