const { setupLogging } = require("./utils/logger");
const { loadConfig } = require("./config/env");
const { ZaloBotService } = require("./services/zaloListener");
const { ZaloAgentBridge } = require("./bridge/zaloAgentBridge");

async function main() {
  const logger = setupLogging();
  const config = loadConfig();

  const zaloService = new ZaloBotService(config, logger);
  const bridge = new ZaloAgentBridge({ zaloService, config, logger });
  await bridge.init();

  zaloService.addMessageHandler((text, chatId) => bridge.onMessageReceived(text, chatId));

  await zaloService.start();
}

main().catch((err) => {
  console.error(`[fatal] ${err.stack || err.message}`);
  process.exit(1);
});
