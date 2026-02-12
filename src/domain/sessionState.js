const fs = require("fs/promises");
const path = require("path");
const { Mutex } = require("../utils/mutex");

function defaultState() {
  return {
    active_profile: null,
    recent_skill_results: [],
    last_artifact: null,
    updated_at: new Date().toISOString(),
  };
}

class SessionStateStore {
  constructor(filePath, logger) {
    this.filePath = path.resolve(filePath);
    this.logger = logger;
    this.state = defaultState();
    this.mutex = new Mutex();
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.state = {
          ...defaultState(),
          ...parsed,
          recent_skill_results: Array.isArray(parsed.recent_skill_results)
            ? parsed.recent_skill_results
            : [],
        };
        return;
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        this.logger.warn("Failed to read agent state, recreating.", { err: err.message });
      }
    }

    await this.save();
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  async save() {
    this.state.updated_at = new Date().toISOString();
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  async update(mutator) {
    await this.mutex.runExclusive(async () => {
      const current = this.getState();
      const next = (await mutator(current)) || current;
      this.state = {
        ...defaultState(),
        ...next,
        recent_skill_results: Array.isArray(next.recent_skill_results)
          ? next.recent_skill_results.slice(-20)
          : [],
      };
      await this.save();
    });
  }

  async recordSkillResult(result) {
    await this.update((current) => {
      current.recent_skill_results.push(result);
      current.recent_skill_results = current.recent_skill_results.slice(-20);
      return current;
    });
  }

  async setLastArtifact(artifact) {
    await this.update((current) => {
      current.last_artifact = artifact;
      return current;
    });
  }
}

module.exports = {
  SessionStateStore,
};
