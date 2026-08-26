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

	//The unstamped sentinel is the only value that begins with an underscore; a
	//	stamped one always begins with a version digit. Deliberately not a
	//	substring comparison against the sentinel text, which build.sh would
	//	rewrite too.
	isStamped: function() {
		return this.stamp.charAt(0) !== "_";
	},

	getVersion: function() {
		return this.isStamped() ? this.stamp : "unbuilt (running from source)";
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
