const { createFsSkills } = require("./skills/fsTools");
const { createGsheetSkills } = require("./skills/gsheetTools");

class SkillRegistry {
  constructor(skills) {
    this.skillMap = new Map(skills.map((skill) => [skill.name, skill]));
  }

  get(name) {
    return this.skillMap.get(name);
  }

  list() {
    return [...this.skillMap.values()];
  }

  toPromptSchema() {
    return this.list().map((skill) => ({
      name: skill.name,
      description: skill.description,
      args_schema: skill.argsSpec,
    }));
  }
}

function createSkillRegistry(config) {
  const skills = [
    ...createGsheetSkills(config),
    ...createFsSkills({ workspaceRoot: config.workspaceRoot }),
  ];
  return new SkillRegistry(skills);
}

module.exports = {
  SkillRegistry,
  createSkillRegistry,
};
