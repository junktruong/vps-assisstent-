const { z } = require("zod");

const planActionSchema = z.object({
  action_type: z.literal("plan"),
  plan: z.array(z.string()).min(1),
  note: z.string().optional(),
});

const callSkillActionSchema = z.object({
  action_type: z.literal("call_skill"),
  skill: z.string().min(1),
  args: z.record(z.any()).default({}),
  reason: z.string().optional(),
});

const askUserActionSchema = z.object({
  action_type: z.literal("ask_user"),
  question: z.string().min(1),
  context: z.string().optional(),
});

const chatActionSchema = z.object({
  action_type: z.literal("chat"),
  message: z.string().min(1),
});

const finalActionSchema = z.object({
  action_type: z.literal("final"),
  summary: z.string().min(1),
  results: z.array(z.any()).default([]),
  artifacts: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.enum(["image", "file", "link"]).default("file"),
        label: z.string().optional(),
        url: z.string().optional(),
        local_path: z.string().optional(),
      })
    )
    .default([]),
  next_steps: z.array(z.string()).default([]),
});

const agentActionSchema = z.discriminatedUnion("action_type", [
  planActionSchema,
  callSkillActionSchema,
  askUserActionSchema,
  chatActionSchema,
  finalActionSchema,
]);

const skillResultSchema = z.object({
  skill: z.string(),
  ok: z.boolean(),
  args: z.record(z.any()).default({}),
  output: z.any().optional(),
  error: z.string().optional(),
  at: z.string(),
});

function parseAgentAction(input) {
  return agentActionSchema.parse(input);
}

function safeParseAgentAction(input) {
  return agentActionSchema.safeParse(input);
}

function toPromptProtocolDescription() {
  return [
    "Return exactly one JSON object and no markdown.",
    "Allowed action_type: plan | call_skill | ask_user | chat | final.",
    "Use call_skill for exactly one skill invocation per step.",
    "Use final to terminate with summary/results/artifacts/next_steps.",
  ].join("\n");
}

module.exports = {
  agentActionSchema,
  parseAgentAction,
  safeParseAgentAction,
  skillResultSchema,
  toPromptProtocolDescription,
};
