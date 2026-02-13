const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseIntWithDefault(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value, fallback) {
  if (!value) {
    return fallback;
  }
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function derivePublicBaseUrl(webhookUrl) {
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.pathname.endsWith("/zalo-webhook")) {
      parsed.pathname = parsed.pathname.replace(/\/zalo-webhook$/, "");
      return parsed.toString().replace(/\/$/, "");
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return webhookUrl.replace(/\/zalo-webhook$/, "").replace(/\/$/, "");
  }
}

function loadConfig() {
  const zaloBotToken = firstDefined(process.env.ZALO_BOT_TOKEN, process.env.BOT_TOKEN);
  if (!zaloBotToken) {
    throw new Error("Missing required environment variable: ZALO_BOT_TOKEN (or BOT_TOKEN)");
  }
  const zaloWebhookUrl = firstDefined(process.env.ZALO_WEBHOOK_URL, process.env.WEBHOOK_URL);
  if (!zaloWebhookUrl) {
    throw new Error("Missing required environment variable: ZALO_WEBHOOK_URL (or WEBHOOK_URL)");
  }
  const zaloWebhookSecret = firstDefined(
    process.env.ZALO_WEBHOOK_SECRET,
    process.env.WEBHOOK_SECRET_TOKEN
  );
  if (!zaloWebhookSecret) {
    throw new Error(
      "Missing required environment variable: ZALO_WEBHOOK_SECRET (or WEBHOOK_SECRET_TOKEN)"
    );
  }

  const config = {
    zaloBotToken,
    zaloWebhookUrl,
    zaloWebhookSecret,
    aiProvider: (process.env.AI_PROVIDER || "BROWSER").toUpperCase(),
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    agentMaxSteps: parseIntWithDefault(process.env.AGENT_MAX_STEPS, 8),
    agentStateFile: path.resolve(process.cwd(), process.env.AGENT_STATE_FILE || "artifacts/agent_state.json"),
    host: process.env.ZALO_HOST || "0.0.0.0",
    port: parseIntWithDefault(process.env.ZALO_PORT, 7090),
    workspaceRoot: process.cwd(),
    artifactsDir: path.resolve(process.cwd(), "artifacts"),
    publicBaseUrl: derivePublicBaseUrl(zaloWebhookUrl),
    gcpServiceAccountJson: process.env.GCP_SERVICE_ACCOUNT_JSON,
    gcpServiceAccountFile: process.env.GCP_SERVICE_ACCOUNT_FILE,
    gcpSheetsScopes: parseList(process.env.GCP_SHEETS_SCOPES, ["https://www.googleapis.com/auth/spreadsheets"]),
    playwrightCliBin: process.env.PLAYWRIGHT_CLI_BIN,
    chatgptUrl: process.env.CHATGPT_URL || "https://chatgpt.com/",
    chatgptSession: process.env.CHATGPT_SESSION || "zalo-agent",
    chatgptBrowserHeaded: parseBool(process.env.CHATGPT_BROWSER_HEADED, false),
    chatgptResponseTimeoutMs: parseIntWithDefault(process.env.CHATGPT_RESPONSE_TIMEOUT_MS, 180000),
    chatgptIdlePollMs: parseIntWithDefault(process.env.CHATGPT_IDLE_POLL_MS, 1200),
    chatgptPromptSelector:
      process.env.CHATGPT_PROMPT_SELECTOR ||
      "textarea[data-testid='prompt-textarea'], textarea#prompt-textarea, textarea",
    chatgptResponseSelector: process.env.CHATGPT_RESPONSE_SELECTOR || "[data-message-author-role='assistant']",
  };

  if (config.aiProvider === "API" && !config.openaiApiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY (for AI_PROVIDER=API)");
  }

  if (!["API", "BROWSER"].includes(config.aiProvider)) {
    throw new Error(`Unsupported AI_PROVIDER=${config.aiProvider}. Supported values: API, BROWSER`);
  }

  return config;
}

module.exports = {
  loadConfig,
  parseBool,
};
