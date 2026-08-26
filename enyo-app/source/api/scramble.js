/*
 * scramble.js — at-rest scrambling for Check Mate task content.
 *
 * Same scheme as webOSArchive/webos-common's AppStorage (XXTEA + base64), but a
 * separate key space and marker so the two never try to read each other's
 * blobs. This is OBFUSCATION, not encryption: the algorithm and master key are
 * public. It only stops a casual reader of a notation file from seeing what is
 * on someone's to-do list.
 *
 * Ported to PHP (checkmate-service/scramble.php) and Python
 * (checkmate-cli/checkmate.py). Each repo carries the same
 * test/scramble-vectors.json and its own test/scramble-test.*, so all four
 * clients are checked to agree byte for byte.
 *
 * Every client reads BOTH formats forever — users have plaintext tasks stored
 * from before this existed. Only content the user actually edits is written
 * back scrambled.
 *
 *   var s = CheckmateScramble;
 *   var move = s.normalizeMove("King to Queen's Rook 3");   // "king-queensrook3"
 *   var blob = s.scramble(move, "Buy milk");                // "cm1:...."
 *   s.unscramble(move, blob);                               // "Buy milk"
 *   s.reveal(move, whateverTheServerSent);                  // plain text, either way
 */
(function (global) {
	"use strict";

	//Public by design — see the header. "Chec" "kMat" "ev1\x01" "wosa".
	var MASTER = [0x43686563, 0x6b4d6174, 0x65763101, 0x776f7361];
	var MARKER = "cm1:";

	/* ---- Move normalization ---------------------------------------------- */

	//Mirrors the service's try_make_move_from_input() followed by
	//	get_filename_from_move()'s character strip, so every client derives the
	//	same salt from the same typed-in move — and it matches the notation
	//	filename the server already keys everything else off.
	function normalizeMove(input) {
		var s = String(input === null || input === undefined ? "" : input).toLowerCase();
		s = s.split(" to ").join(" ");
		s = s.split(" to").join(" ");
		s = s.split("to ").join(" ");
		s = s.split("to").join(" ");
		s = s.split(" - ").join(" ");
		s = s.split(" -").join(" ");
		s = s.split("- ").join(" ");
		s = s.split("-").join(" ");
		s = s.split("'").join("");
		var parts = s.split(" ");
		var move = parts[0] + "-";
		for (var i = 1; i < parts.length; i++) {
			move += parts[i];
		}
		return move.replace(/[^a-zA-Z0-9\-_]/g, "");
	}

	/* ---- XXTEA ------------------------------------------------------------ */

	var DELTA = 0x9E3779B9;

	function mx(sum, y, z, p, e, k) {
		return ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z));
	}

	function xxteaEncrypt(v, k) {
		var n = v.length - 1, z = v[n], y, sum = 0, e, p, q;
		if (n < 1) { return v; }
		q = Math.floor(6 + 52 / (n + 1));
		while (0 < q--) {
			sum = (sum + DELTA) >>> 0;
			e = sum >>> 2 & 3;
			for (p = 0; p < n; p++) {
				y = v[p + 1];
				z = v[p] = (v[p] + mx(sum, y, z, p, e, k)) >>> 0;
			}
			y = v[0];
			z = v[n] = (v[n] + mx(sum, y, z, n, e, k)) >>> 0;
		}
		return v;
	}

	function xxteaDecrypt(v, k) {
		var n = v.length - 1, y = v[0], z, sum, e, p, q;
		if (n < 1) { return v; }
		q = Math.floor(6 + 52 / (n + 1));
		sum = (q * DELTA) >>> 0;
		while (sum !== 0) {
			e = sum >>> 2 & 3;
			for (p = n; p > 0; p--) {
				z = v[p - 1];
				y = v[p] = (v[p] - mx(sum, y, z, p, e, k)) >>> 0;
			}
			z = v[n];
			y = v[0] = (v[0] - mx(sum, y, z, 0, e, k)) >>> 0;
			sum = (sum - DELTA) >>> 0;
		}
		return v;
	}

	/* ---- UTF-8, words, base64 --------------------------------------------- */

	function utf8Encode(str) {
		var out = [], i, c, c2, u;
		for (i = 0; i < str.length; i++) {
			c = str.charCodeAt(i);
			if (c < 0x80) {
				out.push(c);
			} else if (c < 0x800) {
				out.push(0xC0 | c >> 6, 0x80 | c & 63);
			} else if (c >= 0xD800 && c < 0xDC00 && i + 1 < str.length) {
				c2 = str.charCodeAt(++i);
				u = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
				out.push(0xF0 | u >> 18, 0x80 | u >> 12 & 63, 0x80 | u >> 6 & 63, 0x80 | u & 63);
			} else {
				out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
			}
		}
		return out;
	}

	function utf8Decode(bytes) {
		var out = [], i = 0, b, u;
		while (i < bytes.length) {
			b = bytes[i++];
			if (b < 0x80) {
				out.push(String.fromCharCode(b));
			} else if (b < 0xE0) {
				out.push(String.fromCharCode((b & 31) << 6 | bytes[i++] & 63));
			} else if (b < 0xF0) {
				out.push(String.fromCharCode((b & 15) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63));
			} else {
				u = ((b & 7) << 18 | (bytes[i++] & 63) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63) - 0x10000;
				out.push(String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF)));
			}
		}
		return out.join("");
	}

	//First word is the byte length, so decode can strip block padding.
	function bytesToWords(bytes) {
		var words = [bytes.length >>> 0], i;
		for (i = 0; i < bytes.length; i++) {
			words[1 + (i >> 2)] = (words[1 + (i >> 2)] || 0) | (bytes[i] & 0xFF) << ((i & 3) << 3);
		}
		if (words.length < 2) { words.push(0); }
		for (i = 0; i < words.length; i++) { words[i] = words[i] >>> 0; }
		return words;
	}

	function wordsToBytes(words) {
		var len = words[0], bytes = [], i;
		if (typeof len !== "number" || len < 0 || len > (words.length - 1) * 4) {
			return null;
		}
		for (i = 0; i < len; i++) {
			bytes.push(words[1 + (i >> 2)] >>> ((i & 3) << 3) & 0xFF);
		}
		return bytes;
	}

	//Own base64: btoa() is O(n^2) on old WebKit and absent in some environments.
	var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

	function base64Encode(bytes) {
		var out = [], i, b1, b2, b3;
		for (i = 0; i < bytes.length; i += 3) {
			b1 = bytes[i]; b2 = bytes[i + 1]; b3 = bytes[i + 2];
			out.push(B64.charAt(b1 >> 2));
			out.push(B64.charAt((b1 & 3) << 4 | (b2 === undefined ? 0 : b2 >> 4)));
			out.push(b2 === undefined ? "=" : B64.charAt((b2 & 15) << 2 | (b3 === undefined ? 0 : b3 >> 6)));
			out.push(b3 === undefined ? "=" : B64.charAt(b3 & 63));
		}
		return out.join("");
	}

	function base64Decode(str) {
		var out = [], i, e1, e2, e3, e4;
		str = str.replace(/[^A-Za-z0-9+\/]/g, "");
		for (i = 0; i < str.length; i += 4) {
			//charAt past the end returns "" and indexOf("") is 0, so guard
			//	explicitly or a short final group gains phantom bytes.
			e1 = B64.indexOf(str.charAt(i));
			e2 = i + 1 < str.length ? B64.indexOf(str.charAt(i + 1)) : -1;
			e3 = i + 2 < str.length ? B64.indexOf(str.charAt(i + 2)) : -1;
			e4 = i + 3 < str.length ? B64.indexOf(str.charAt(i + 3)) : -1;
			out.push((e1 << 2 | e2 >> 4) & 0xFF);
			if (e3 >= 0) { out.push((e2 << 4 | e3 >> 2) & 0xFF); }
			if (e4 >= 0) { out.push((e3 << 6 | e4) & 0xFF); }
		}
		return out;
	}

	/* ---- Public surface --------------------------------------------------- */

	//Per-notation key, so the same task text scrambles differently for different
	//	users. Salted with the move rather than the grandmaster: a password
	//	change must not orphan every task the user already has.
	function moveKey(normalizedMove) {
		var s = "checkmate:" + normalizedMove;
		var k = [MASTER[0], MASTER[1], MASTER[2], MASTER[3]], i, w;
		for (i = 0; i < s.length; i++) {
			w = k[i & 3];
			k[i & 3] = (w ^ ((w << 5) + s.charCodeAt(i) + (w >>> 2))) >>> 0;
		}
		return k;
	}

	function scramble(normalizedMove, plaintext) {
		if (plaintext === null || plaintext === undefined || plaintext === "") {
			return "";
		}
		var packed = xxteaEncrypt(bytesToWords(utf8Encode(String(plaintext))), moveKey(normalizedMove));
		var bytes = [], i, w;
		for (i = 0; i < packed.length; i++) {
			w = packed[i];
			bytes.push(w & 0xFF, w >>> 8 & 0xFF, w >>> 16 & 0xFF, w >>> 24 & 0xFF);
		}
		return MARKER + base64Encode(bytes);
	}

	function unscramble(normalizedMove, blob) {
		if (typeof blob !== "string" || blob.indexOf(MARKER) !== 0) {
			return null;
		}
		var bytes = base64Decode(blob.slice(MARKER.length));
		if (bytes.length < 8 || bytes.length % 4 !== 0) {
			return null;
		}
		var words = [], i;
		for (i = 0; i < bytes.length; i += 4) {
			words.push((bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24) >>> 0);
		}
		var plainBytes = wordsToBytes(xxteaDecrypt(words, moveKey(normalizedMove)));
		return plainBytes === null ? null : utf8Decode(plainBytes);
	}

	function isScrambled(value) {
		return typeof value === "string" && value.indexOf(MARKER) === 0;
	}

	//Read either format. A blob we can't unscramble (wrong notation, truncated
	//	file) comes back as-is rather than as an empty row, so the user can still
	//	see that something is there.
	function reveal(normalizedMove, value) {
		if (!isScrambled(value)) {
			return value;
		}
		var plain = unscramble(normalizedMove, value);
		return plain === null ? value : plain;
	}

	var api = {
		normalizeMove: normalizeMove,
		scramble: scramble,
		unscramble: unscramble,
		isScrambled: isScrambled,
		reveal: reveal,
		marker: MARKER
	};

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	} else {
		global.CheckmateScramble = api;
	}
}(typeof window !== "undefined" ? window : this));
