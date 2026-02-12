const {
  safeParseAgentAction,
  toPromptProtocolDescription,
} = require("../domain/agentProtocol");
const { parseJsonObject } = require("../utils/json");

class AgentRunner {
  constructor({ aiAdapter, skillRegistry, stateStore, logger, maxSteps = 8 }) {
    this.aiAdapter = aiAdapter;
    this.skillRegistry = skillRegistry;
    this.stateStore = stateStore;
    this.logger = logger;
    this.maxSteps = maxSteps;
  }

  async run(userMessage, chatId) {
    const history = [];

    for (let step = 1; step <= this.maxSteps; step += 1) {
      const appState = this.stateStore.getState();
      const prompt = this.buildPrompt({ step, userMessage, chatId, appState, history });
      const action = await this.requestAction(prompt, step);

      history.push({
        step,
        type: "action",
        action,
      });

      if (action.action_type === "plan") {
        continue;
      }

      if (action.action_type === "call_skill") {
        const skillResult = await this.executeSkill(action);
        history.push({
          step,
          type: "skill_result",
          result: skillResult,
        });
        await this.stateStore.recordSkillResult(skillResult);
        continue;
      }

      if (action.action_type === "chat") {
        return {
          kind: "chat",
          message: action.message,
          history,
        };
      }

      if (action.action_type === "ask_user") {
        return {
          kind: "ask_user",
          question: action.question,
          context: action.context,
          history,
        };
      }

      return {
        kind: "final",
        summary: action.summary,
        results: action.results,
        artifacts: action.artifacts,
        next_steps: action.next_steps,
        history,
      };
    }

    return {
      kind: "final",
      summary: `Reached AGENT_MAX_STEPS=${this.maxSteps}.`,
      results: [],
      artifacts: [],
      next_steps: ["Refine request or increase AGENT_MAX_STEPS"],
      history,
    };
  }

  buildPrompt({ step, userMessage, chatId, appState, history }) {
    const compactState = {
      ...appState,
      recent_skill_results: (appState.recent_skill_results || []).slice(-8),
    };

    const compactHistory = history.slice(-8);

    return [
      "You are running inside Zalo Agent runtime.",
      toPromptProtocolDescription(),
      "",
      `Current step: ${step}`,
      `Chat ID: ${chatId}`,
      `User message: ${userMessage}`,
      "",
      "Current app state JSON:",
      JSON.stringify(compactState, null, 2),
      "",
      "Available skills:",
      JSON.stringify(this.skillRegistry.toPromptSchema(), null, 2),
      "",
      "Execution history:",
      JSON.stringify(compactHistory, null, 2),
      "",
      "Return one JSON object only.",
    ].join("\n");
  }

  async requestAction(prompt, step) {
    const raw = await this.aiAdapter.completeAction(prompt);
    const parsed = this.tryParseAction(raw);
    if (parsed.ok) {
      return parsed.value;
    }

    this.logger.warn("Invalid action JSON, triggering one repair pass", {
      step,
      error: parsed.error,
    });

    const repairPrompt = [
      "The previous response is invalid against schema.",
      "Fix it and return exactly one corrected JSON object.",
      "",
      "Validation error:",
      parsed.error,
      "",
      "Original response:",
      raw,
    ].join("\n");

    const repairedRaw = await this.aiAdapter.completeAction(repairPrompt);
    const repaired = this.tryParseAction(repairedRaw);

    if (!repaired.ok) {
      throw new Error(`Action parse failed after repair: ${repaired.error}`);
    }

    return repaired.value;
  }

  tryParseAction(rawText) {
    try {
      const json = parseJsonObject(rawText);
      const checked = safeParseAgentAction(json);
      if (checked.success) {
        return { ok: true, value: checked.data };
      }
      return {
        ok: false,
        error: checked.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async executeSkill(action) {
    const now = new Date().toISOString();
    const skill = this.skillRegistry.get(action.skill);

    if (!skill) {
      return {
        skill: action.skill,
        ok: false,
        args: action.args || {},
        error: "Unknown skill",
        at: now,
      };
    }

    const validated = skill.argsSchema.safeParse(action.args || {});
    if (!validated.success) {
      return {
        skill: action.skill,
        ok: false,
        args: action.args || {},
        error: validated.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
        at: now,
      };
    }

    try {
      const output = await skill.run(validated.data);
      return {
        skill: action.skill,
        ok: true,
        args: validated.data,
        output,
        at: now,
      };
    } catch (err) {
      return {
        skill: action.skill,
        ok: false,
        args: validated.data,
        error: err.message,
        at: now,
      };
    }
  }
}

module.exports = {
  AgentRunner,
};
