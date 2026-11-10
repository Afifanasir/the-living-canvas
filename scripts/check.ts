// Run: node scripts/check.ts
import assert from "node:assert/strict";
import { cueAt, sentences } from "../lib/subtitles.ts";

const line = "Hi. This one is much longer than that! Bye?";
assert.deepEqual(sentences(line), ["Hi.", "This one is much longer than that!", "Bye?"]);
assert.equal(cueAt(line, 0, 10), 0); // leading silence
assert.equal(cueAt(line, 1, 10), 1); // past the short first sentence
assert.equal(cueAt(line, 9.7, 10), 2);
assert.equal(cueAt(line, 20, 10), 2); // past the end clamps
assert.equal(cueAt("One sentence only", 3, 0), 0); // duration not loaded yet
console.log("ok");
