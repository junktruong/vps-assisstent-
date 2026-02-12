const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveWorkspacePath } = require("../src/infra/skills/fsTools");

test("resolveWorkspacePath accepts path inside workspace", () => {
  const workspace = "/tmp/workspace";
  const resolved = resolveWorkspacePath(workspace, "src/index.js");
  assert.equal(resolved, path.resolve(workspace, "src/index.js"));
});

test("resolveWorkspacePath blocks path outside workspace", () => {
  const workspace = "/tmp/workspace";
  assert.throws(() => resolveWorkspacePath(workspace, "../../etc/passwd"));
});
