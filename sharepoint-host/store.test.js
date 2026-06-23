import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { readMerged, writeOwn, saveBrief, calendarRoot, briefsRoot } from "./store.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sp-store-"));
}

test("readMerged returns [] when nothing exists", () => {
  const dir = tmpDir();
  assert.deepEqual(readMerged(dir), []);
});

test("readMerged merges every user's calendar.json and tags _owner", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(calendarRoot(dir), "alice"), { recursive: true });
  fs.mkdirSync(path.join(calendarRoot(dir), "bob"), { recursive: true });
  fs.writeFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), JSON.stringify([{ id: "a1", title: "A" }]));
  fs.writeFileSync(path.join(calendarRoot(dir), "bob", "calendar.json"), JSON.stringify([{ id: "b1", title: "B" }]));
  const merged = readMerged(dir);
  assert.equal(merged.length, 2);
  const alice = merged.find((x) => x.id === "a1");
  const bob = merged.find((x) => x.id === "b1");
  assert.equal(alice._owner, "alice");
  assert.equal(bob._owner, "bob");
});

test("readMerged skips a corrupt file without throwing", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(calendarRoot(dir), "alice"), { recursive: true });
  fs.mkdirSync(path.join(calendarRoot(dir), "bob"), { recursive: true });
  fs.writeFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), "{ not json");
  fs.writeFileSync(path.join(calendarRoot(dir), "bob", "calendar.json"), JSON.stringify([{ id: "b1" }]));
  const merged = readMerged(dir);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "b1");
});

test("writeOwn writes only the user's own items and strips _owner", () => {
  const dir = tmpDir();
  const items = [
    { id: "mine1", title: "Mine", _owner: "alice" },
    { id: "new1", title: "New (no owner)" },
    { id: "theirs1", title: "Theirs", _owner: "bob" },
  ];
  const count = writeOwn(dir, "alice", items);
  assert.equal(count, 2);
  const onDisk = JSON.parse(fs.readFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), "utf8"));
  assert.equal(onDisk.length, 2);
  assert.ok(onDisk.every((x) => !("_owner" in x)));
  assert.deepEqual(onDisk.map((x) => x.id).sort(), ["mine1", "new1"]);
});

test("saveBrief writes the file into the user's brief folder and blocks path traversal", () => {
  const dir = tmpDir();
  const name = saveBrief(dir, "alice", "../../evil.txt", Buffer.from("hello"));
  assert.equal(name, "evil.txt");
  const written = path.join(briefsRoot(dir), "alice", "evil.txt");
  assert.equal(fs.readFileSync(written, "utf8"), "hello");
});
