/*
 * Credentials on the user's webOS Account.
 *
 * Drives the real account.js against the real webos-app-storage.js SDK, with
 * only the HTTP transport faked -- so the scrambling, the request shapes and
 * the token handling are all the genuine article. What's being checked is the
 * behaviour that would bite a user: that credentials go up scrambled, that a
 * revoked device sign-in recovers instead of failing forever, and that an
 * account holding nothing is an ordinary answer rather than an error.
 *
 *   node test/account-test.js
 */

var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0;
var fail = 0;

function ok(name, cond, detail) {
	if (cond) { pass++; console.log("  ok    " + name); }
	else { fail++; console.log("  FAIL  " + name + (detail !== undefined ? "  <<< " + JSON.stringify(detail) : "")); }
}
function section(name) { console.log("\n--- " + name + " ---"); }

/* ---------- a webOS device, near enough ---------- */

var localStore = {};
global.localStorage = {
	getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
	setItem: function (k, v) { localStore[k] = String(v); },
	removeItem: function (k) { delete localStore[k]; }
};
global.window = global;
global.XMLHttpRequest = function () {};

// The account service over the Luna bus. deviceToken is what the device would
// hand back; set it to null to model "nobody is signed in on this device".
var bus = {deviceToken: "token-1", alias: "jon@example.test", calls: 0, readyAfter: 0};
global.PalmServiceBridge = function () {
	this.call = function (url, args) {
		bus.calls++;
		var self = this;
		// readyAfter models a service that isn't up yet: the first N calls come
		// back with nothing, exactly as they do just after an app launches.
		var token = (bus.calls > bus.readyAfter) ? bus.deviceToken : null;
		if (bus.readyAfter && bus.calls > bus.readyAfter) { token = token || "token-1"; }
		var reply = token
			? JSON.stringify({token: token, accountAlias: bus.alias})
			: JSON.stringify({});
		setTimeout(function () { self.onservicecallback(reply); }, 0);
	};
};

var WebOSAppStorage = require(path.join(ROOT, "enyo-app/source/api/webos-app-storage.js"));
global.WebOSAppStorage = WebOSAppStorage;
var CheckmateAccount = require(path.join(ROOT, "enyo-app/source/api/account.js"));

/* ---------- a fake storage service ---------- */

// Holds raw records exactly as the server would: whatever the SDK uploaded.
var server = {records: {}, requests: [], failNext: null};

function fakeTransport(req, cb) {
	server.requests.push(req);
	if (server.failNext) {
		var f = server.failNext;
		server.failNext = null;
		return cb({status: f.status, json: {error: f.error || "failed"}});
	}
	var body = req.body ? JSON.parse(req.body) : {};
	var m = /[?&]m=([^&]+)/.exec(req.url);
	var method = m ? m[1] : "";
	var token = (req.headers.Authorization || "").replace("PalmAuth token=", "");

	// Anything but the current device token is stale, which is what a device
	// sign-out looks like from here.
	if (method !== "authenticateWeb" && token !== bus.deviceToken) {
		return cb({status: 401, json: {error: "unauthorized"}});
	}

	if (method === "get") {
		var key = /[?&]key=([^&]+)/.exec(req.url);
		key = key ? decodeURIComponent(key[1]) : "";
		if (!Object.prototype.hasOwnProperty.call(server.records, key)) {
			return cb({status: 404, json: {error: "not_found"}});
		}
		return cb({status: 200, json: {key: key, value: server.records[key], revision: 1, updated_at: 0}});
	}
	if (method === "set") {
		server.records[body.key] = body.value;
		return cb({status: 200, json: {revision: 1, usage: {}}});
	}
	if (method === "delete") {
		var existed = Object.prototype.hasOwnProperty.call(server.records, body.key);
		delete server.records[body.key];
		return cb({status: 200, json: {deleted: existed, usage: {}}});
	}
	return cb({status: 400, json: {error: "bad_method"}});
}

function freshStore() {
	for (var k in localStore) { delete localStore[k]; }
	CheckmateAccount.reset(new WebOSAppStorage({
		appId: CheckmateAccount.appId, appName: "Check Mate", transport: fakeTransport
	}));
}

function resetWorld() {
	server.records = {};
	server.requests = [];
	server.failNext = null;
	bus.deviceToken = "token-1";
	bus.calls = 0;
	bus.readyAfter = 0;
	freshStore();
}

var CREDS = {move: "Bishop to King's Rook 8", grandmaster: "Hao Wang"};

/* ================= AVAILABILITY ================= */
section("Only offered where there is an account to offer");
(function () {
	resetWorld();
	ok("webOS is detected", CheckmateAccount.isSupported() === true);

	var saved = global.PalmServiceBridge;
	delete global.PalmServiceBridge;
	ok("a browser is not", CheckmateAccount.isSupported() === false);
	global.PalmServiceBridge = saved;
	ok("and webOS again once the bus is back", CheckmateAccount.isSupported() === true);
})();

/* ================= SIGNING IN ================= */
section("Adopting the device's account sign-in");
(function () {
	resetWorld();
	var result = "pending";
	CheckmateAccount.connect(function (err) { result = err; });
	setTimeout(function () {
		ok("connecting uses the device's own sign-in", result === null, result);
		ok("  without ever asking for a password", bus.calls === 1);
		ok("  and it knows whose account it is", CheckmateAccount.accountName() === "jon@example.test");
		ok("  and reports itself connected", CheckmateAccount.isConnected() === true);

		// The account service is not always ready the instant the app is, and
		// asking too early answers "no account" rather than "wait". Giving up on
		// the first answer is what made a device with credentials saved show its
		// log-in screen anyway -- by the time anything asked again, it worked.
		resetWorld();
		bus.deviceToken = null;
		bus.readyAfter = 2;          // the third call is the one that works
		var err3 = "pending";
		CheckmateAccount.connect(function (e) { err3 = e; });
		setTimeout(function () {
			ok("a service that wakes up late still connects", err3 === null, err3);
			ok("  after more than one attempt", bus.calls >= 3, bus.calls);

			// But a device with genuinely nobody signed in must still say so.
			resetWorld();
			bus.deviceToken = null;
			var err2 = "pending";
			CheckmateAccount.connect(function (e) { err2 = e; });
			setTimeout(function () {
				ok("no device account is reported clearly", !!err2 && err2.code === "no_device_account", err2);
				ok("  in words a user can act on",
					CheckmateAccount.describeError(err2).indexOf("Device Info") !== -1,
					CheckmateAccount.describeError(err2));
				ok("  having tried more than once first", bus.calls >= 3, bus.calls);
				roundTrip();
			}, 5000);
		}, 5000);
	}, 5);
})();

/* ================= SAVE AND LOAD ================= */
function roundTrip() {
	section("Saving and reading credentials back");
	resetWorld();
	CheckmateAccount.connect(function () {
		// An account that has never saved anything is not an error.
		CheckmateAccount.load(function (err, creds) {
			ok("an empty account is not a failure", err === null, err);
			ok("  and returns nothing", creds === null);

			CheckmateAccount.save(CREDS, function (err) {
				ok("saving succeeds", err === null, err);

				var stored = server.records[CheckmateAccount.credentialKey];
				ok("the server holds a scrambled blob", typeof stored === "string" && stored.indexOf("v1:") === 0, stored);
				ok("  with the grandmaster nowhere in it", stored.indexOf("Hao Wang") === -1);
				ok("  nor the move", stored.indexOf("Rook") === -1);
				// The SDK's own primitives must be able to read it back, which is
				// what another device will be doing.
				var plain = WebOSAppStorage.unscramble(CheckmateAccount.appId, CheckmateAccount.credentialKey, stored);
				ok("  and it really is our record underneath", JSON.parse(plain).grandmaster === "Hao Wang");

				CheckmateAccount.load(function (err, creds) {
					ok("reading it back works", err === null, err);
					ok("  the move survives", creds.move === CREDS.move, creds);
					ok("  the grandmaster survives", creds.grandmaster === CREDS.grandmaster);

					// A second device: same account, its own store instance.
					freshStore();
					CheckmateAccount.connect(function () {
						CheckmateAccount.load(function (err, creds2) {
							ok("another device sees the same credentials",
								creds2 && creds2.move === CREDS.move, creds2);
							serverConfig();
						});
					});
				});
			});
		});
	});
}

/* ================= SELF-HOSTING ================= */
function serverConfig() {
	section("Self-hosted lists come back pointing at the right server");
	resetWorld();
	CheckmateAccount.connect(function () {
		var withServer = {
			move: CREDS.move, grandmaster: CREDS.grandmaster,
			server: {urlBase: "todo.example.test", insecure: true, useCustomServer: true, customServer: "lan.example.test:8080"}
		};
		CheckmateAccount.save(withServer, function (err) {
			ok("saving with server settings works", err === null, err);
			CheckmateAccount.load(function (err, creds) {
				// Credentials alone don't identify a self-hosted list; without
				// this a second device would auto-log-in against the wrong one.
				ok("the self-host server comes back", creds.server &&
					creds.server.customServer === "lan.example.test:8080", creds.server);
				ok("  and so does the insecure flag", creds.server.insecure === true);

				// Records written before this carry no server at all.
				resetWorld();
				CheckmateAccount.connect(function () {
					CheckmateAccount.save(CREDS, function () {
						CheckmateAccount.load(function (err, plainCreds) {
							ok("a record without server settings is still valid", plainCreds.move === CREDS.move);
							ok("  and simply reports none", plainCreds.server === null);
							staleToken();
						});
					});
				});
			});
		});
	});
}

/* ================= A REVOKED SIGN-IN ================= */
function staleToken() {
	section("A device signed out and back in recovers");
	resetWorld();
	CheckmateAccount.connect(function () {
		CheckmateAccount.save(CREDS, function () {
			// The user signs out of their webOS Account and back in: the old
			// token is revoked server-side, so every call 401s. Without the
			// retry this fails forever and the app looks broken until it is
			// reinstalled.
			bus.deviceToken = "token-2";
			var before = bus.calls;
			CheckmateAccount.load(function (err, creds) {
				ok("a revoked token recovers instead of failing", err === null, err);
				ok("  by re-adopting the device account", bus.calls > before);
				ok("  and the credentials still read back", creds && creds.move === CREDS.move, creds);

				// But a genuine failure is still a failure.
				resetWorld();
				CheckmateAccount.connect(function () {
					server.failNext = {status: 500, error: "server_error"};
					CheckmateAccount.load(function (err) {
						ok("a real error is still reported", !!err, err);
						forgetting();
					});
				});
			});
		});
	});
}

/* ================= FORGETTING ================= */
function forgetting() {
	section("Forgetting them");
	resetWorld();
	CheckmateAccount.connect(function () {
		CheckmateAccount.save(CREDS, function () {
			CheckmateAccount.forget(function (err) {
				ok("forgetting succeeds", err === null, err);
				ok("  and the record is gone from the server",
					!Object.prototype.hasOwnProperty.call(server.records, CheckmateAccount.credentialKey));
				CheckmateAccount.load(function (err, creds) {
					ok("  so another device finds nothing", err === null && creds === null, [err, creds]);
					// Forgetting twice is not an error -- the user's intent is
					// already satisfied.
					CheckmateAccount.forget(function (err) {
						ok("forgetting again is not an error", err === null, err);
						badInput();
					});
				});
			});
		});
	});
}

function badInput() {
	section("Refusing to store half a credential");
	resetWorld();
	CheckmateAccount.connect(function () {
		CheckmateAccount.save({move: "Bishop to King's Rook 8"}, function (err) {
			ok("a missing grandmaster is refused", !!err && err.code === "invalid", err);
			CheckmateAccount.save(null, function (err) {
				ok("nothing at all is refused", !!err && err.code === "invalid", err);
				ok("  and the server was never asked", !server.records[CheckmateAccount.credentialKey]);
				done();
			});
		});
	});
}

function done() {
	console.log("\n========================================");
	console.log("  passed: " + pass + "   failed: " + fail);
	console.log("========================================\n");
	process.exit(fail === 0 ? 0 : 1);
}
