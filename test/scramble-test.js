/*
 * Conformance check for source/api/scramble.js against the shared vector set.
 *
 * The vectors are the reference: passing here means a task scrambled on a
 * TouchPad reads correctly on the web, in the CLI, and back again. The same
 * vector file ships in checkmate-service, checkmate-cli and webos-checkmate.
 *
 *   node test/scramble-test.js
 */

var path = require("path");
var s = require(path.join(__dirname, "..", "enyo-app", "source", "api", "scramble.js"));
var vectors = require(path.join(__dirname, "scramble-vectors.json"));

var pass = 0;
var fail = 0;

function check(label, expected, actual) {
	if (expected === actual) {
		pass++;
	} else {
		fail++;
		console.error("FAIL " + label + "\n  expected: " + JSON.stringify(expected) + "\n  actual:   " + JSON.stringify(actual));
	}
}

for (var i = 0; i < vectors.normalize.length; i++) {
	var c = vectors.normalize[i];
	check("normalize(" + c.input + ")", c.expected, s.normalizeMove(c.input));
}

for (i = 0; i < vectors.vectors.length; i++) {
	var v = vectors.vectors[i];
	check("scramble #" + i, v.blob, s.scramble(v.move, v.plain));
	if (v.blob !== "") {
		check("unscramble #" + i, v.plain, s.unscramble(v.move, v.blob));
		check("reveal #" + i, v.plain, s.reveal(v.move, v.blob));
	}
}

//Plaintext must survive untouched, and a blob from another notation must not
//	silently decode to something plausible.
check("reveal passes plaintext through", "Buy milk", s.reveal("king-queensrook3", "Buy milk"));
check("isScrambled false for plaintext", false, s.isScrambled("Buy milk"));
check("isScrambled true for blob", true, s.isScrambled(vectors.vectors[0].blob));
check("wrong notation does not decode", null, s.unscramble("queen-kingsbishop8", vectors.vectors[0].blob));
check("garbage marker does not decode", null, s.unscramble("king-queensrook3", "cm1:notbase64!!"));
check("empty scrambles to empty", "", s.scramble("king-queensrook3", ""));
check("undecodable blob reveals as itself", "cm1:notbase64!!", s.reveal("king-queensrook3", "cm1:notbase64!!"));

console.log("scramble.js: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
