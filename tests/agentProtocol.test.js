const test = require("node:test");
const assert = require("node:assert/strict");
const { safeParseAgentAction } = require("../src/domain/agentProtocol");

test("accepts valid final action", () => {
  const parsed = safeParseAgentAction({
    action_type: "final",
    summary: "Done",
    results: ["ok"],
    artifacts: [],
    next_steps: [],
  });

  assert.equal(parsed.success, true);
});

test("rejects invalid action payload", () => {
  const parsed = safeParseAgentAction({
    action_type: "call_skill",
    args: {},
  });

  assert.equal(parsed.success, false);
});
