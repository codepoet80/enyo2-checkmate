/*
 * account.js — keep Check Mate credentials on the user's webOS Account.
 *
 * A thin wrapper over webos-app-storage.js (the webOS Archive app storage SDK).
 * Plain ES5 with no framework of its own, so the identical file runs here on
 * Enyo and on Mojo's old WebKit — webos-checkmate carries a verbatim copy as
 * app/models/account-model.js.
 *
 * Stores the move, the grandmaster, and which server they belong to -- nothing
 * else. Tasks stay on the Check Mate service where they belong; this is one
 * small record so that signing in once on one webOS device is enough for all of
 * them. (The server settings ride along because credentials alone do not
 * identify a self-hosted list.)
 *
 * The SDK scrambles every value before upload (the same XXTEA scheme Check Mate
 * uses for task content, keyed on app id plus data key), so credentials are
 * never plainly readable on the storage server. That is obfuscation, not
 * encryption, and the SDK's own header says as much — worth knowing, given what
 * this stores.
 *
 *   if (CheckmateAccount.isSupported()) {
 *       CheckmateAccount.connect(function (err) {
 *           if (!err) { CheckmateAccount.load(function (err, creds) { ... }); }
 *       });
 *   }
 */
(function (global) {
	"use strict";

	//ONE namespace for both clients, deliberately neither app's package id.
	//	App storage is scoped by app id, and so is the SDK's scramble key, so a
	//	TouchPad running Check Mate HD and a Pre running Check Mate have to agree
	//	on this string or they cannot read each other's credentials — which is
	//	the entire point of saving them to the account.
	var APP_ID = "com.webosarchive.checkmate";
	var APP_NAME = "Check Mate";
	var CREDENTIAL_KEY = "credentials";

	var store = null;
	var connected = false;

	//webOS, of any vintage. PalmServiceBridge is the one that matters: it is
	//	what useDeviceAccount() talks to the account service over. Absent in a
	//	browser and in the Cordova build, where this whole feature stays hidden.
	function isSupported() {
		return typeof global.PalmServiceBridge !== "undefined";
	}

	function getStore() {
		if (!store && typeof global.WebOSAppStorage !== "undefined") {
			store = new global.WebOSAppStorage({appId: APP_ID, appName: APP_NAME});
		}
		return store;
	}

	//Used by the tests to inject a fake transport, and to start from a known
	//	state between cases.
	function reset(replacement) {
		store = replacement || null;
		connected = false;
	}

	function isConnected() {
		var s = getStore();
		return !!(s && s.isSignedIn());
	}

	/**
	 * Adopt the token minted when the user signed this DEVICE into their webOS
	 * Account, so the app never asks for that password itself. cb(err) with err
	 * null on success.
	 */
	function connect(cb) {
		var s = getStore();
		if (!isSupported() || !s) {
			return cb({code: "unsupported", message: "This device has no webOS Account service."});
		}
		if (s.isSignedIn() && connected) {
			return cb(null);
		}
		s.useDeviceAccount(function (err) {
			connected = !err;
			cb(err || null);
		});
	}

	//A cached token says nothing about whether the account it belongs to is
	//	still the one signed into the device: signing out revokes it server side,
	//	and it then fails with 401 forever. Re-adopt once and try again before
	//	reporting a failure.
	function withRetry(attempt, cb) {
		attempt(function (err, result) {
			if (!err || err.status !== 401) {
				return cb(err, result);
			}
			var s = getStore();
			if (!s) { return cb(err, result); }
			s.useDeviceAccount(function (reauthErr) {
				if (reauthErr) { return cb(err, result); }
				connected = true;
				attempt(cb);
			});
		});
	}

	/** cb(err, credentials) — credentials is null when the account holds none. */
	function load(cb) {
		var s = getStore();
		if (!s) { return cb({code: "unsupported", message: "No account storage."}); }
		withRetry(function (done) {
			s.get(CREDENTIAL_KEY, function (err, record) {
				//"not found" is the ordinary answer for an account that has never
				//	saved anything, not a failure.
				if (err) {
					return done(err.code === "not_found" ? null : err, null);
				}
				var value = record ? record.value : null;
				if (!value || !value.move || !value.grandmaster) {
					return done(null, null);
				}
				//`server` rides along because credentials alone do not identify a
				//	self-hosted list: without it a second device would auto-log-in
				//	against the shared service and fail. Absent for records written
				//	before this, and for anyone on the default server.
				done(null, {move: value.move, grandmaster: value.grandmaster,
					server: value.server || null});
			});
		}, cb);
	}

	/** cb(err) */
	function save(credentials, cb) {
		var s = getStore();
		if (!s) { return cb({code: "unsupported", message: "No account storage."}); }
		if (!credentials || !credentials.move || !credentials.grandmaster) {
			return cb({code: "invalid", message: "Both a move and a grandmaster are needed."});
		}
		var value = {move: credentials.move, grandmaster: credentials.grandmaster};
		if (credentials.server) {
			value.server = credentials.server;
		}
		withRetry(function (done) {
			s.set(CREDENTIAL_KEY, value, function (err) { done(err || null); });
		}, cb);
	}

	/** cb(err) — removing something that was never there is a success. */
	function forget(cb) {
		var s = getStore();
		if (!s) { return cb({code: "unsupported", message: "No account storage."}); }
		withRetry(function (done) {
			s.remove(CREDENTIAL_KEY, function (err) {
				done(err && err.code !== "not_found" ? err : null);
			});
		}, cb);
	}

	/** The account's own name, for telling the user whose account this is. */
	function accountName() {
		var s = getStore();
		var account = s ? s.getAccount() : null;
		return (account && account.alias) ? account.alias : null;
	}

	//Anything that isn't "we are not on webOS" is worth putting in front of the
	//	user in words they can act on.
	function describeError(err) {
		if (!err) { return null; }
		if (err.code === "no_device_account") {
			return "No webOS Account is signed in on this device. Sign in from Device Info, then try again.";
		}
		if (err.code === "unsupported" || err.code === "no_palm_bus") {
			return "This device has no webOS Account service.";
		}
		if (err.code === "network" || err.status === 0) {
			return "Could not reach your webOS Account. Check your network connection.";
		}
		if (err.status === 401) {
			return "Your webOS Account sign-in has expired. Sign in again from Device Info.";
		}
		return err.message || "Your webOS Account reported an error.";
	}

	var api = {
		appId: APP_ID,
		credentialKey: CREDENTIAL_KEY,
		isSupported: isSupported,
		isConnected: isConnected,
		connect: connect,
		load: load,
		save: save,
		forget: forget,
		accountName: accountName,
		describeError: describeError,
		reset: reset
	};

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	} else {
		global.CheckmateAccount = api;
	}
}(typeof window !== "undefined" ? window : this));
