const { parentPort, workerData } = require("worker_threads");
const { createAIAdapter } = require("../infra/aiFactory");
const { createSkillRegistry } = require("../infra/skillRegistry");
const { SessionStateStore } = require("../domain/sessionState");
const { AgentRunner } = require("../infra/agentRunner");

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

async function run() {
  const { messageText, chatId, config } = workerData;

  const aiAdapter = createAIAdapter(config, logger);
  const stateStore = new SessionStateStore(config.agentStateFile, logger);
  await stateStore.load();

  const skillRegistry = createSkillRegistry(config);

  const runner = new AgentRunner({
    aiAdapter,
    skillRegistry,
    stateStore,
    logger,
    maxSteps: config.agentMaxSteps,
  });

  const result = await runner.run(messageText, chatId);
  return result;
}

run()
  .then((result) => {
    parentPort.postMessage({ ok: true, result });
  })
  .catch((err) => {
    parentPort.postMessage({ ok: false, error: err.message });
  });
