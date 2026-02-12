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

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  const config = {
    zaloBotToken: requireEnv("ZALO_BOT_TOKEN"),
    zaloWebhookUrl: requireEnv("ZALO_WEBHOOK_URL"),
    zaloWebhookSecret: requireEnv("ZALO_WEBHOOK_SECRET"),
    aiProvider: process.env.AI_PROVIDER || "API",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    agentMaxSteps: parseIntWithDefault(process.env.AGENT_MAX_STEPS, 8),
    agentStateFile: path.resolve(process.cwd(), process.env.AGENT_STATE_FILE || "artifacts/agent_state.json"),
    host: process.env.ZALO_HOST || "0.0.0.0",
    port: parseIntWithDefault(process.env.ZALO_PORT, 8000),
    allowQuerySecret: parseBool(process.env.ZALO_ALLOW_QUERY_SECRET, false),
    allowBodySecret: parseBool(process.env.ZALO_ALLOW_BODY_SECRET, true),
    secretHeaders: parseList(process.env.ZALO_WEBHOOK_SECRET_HEADERS, ["x-zalo-secret", "x-webhook-secret"]),
    secretFields: parseList(process.env.ZALO_WEBHOOK_SECRET_FIELDS, ["secret", "webhook_secret"]),
    zaloSendMessageUrl: process.env.ZALO_SEND_MESSAGE_URL || "https://openapi.zalo.me/v3.0/oa/message/cs",
    workspaceRoot: process.cwd(),
    artifactsDir: path.resolve(process.cwd(), "artifacts"),
    publicBaseUrl: derivePublicBaseUrl(requireEnv("ZALO_WEBHOOK_URL")),
    gcpServiceAccountJson: process.env.GCP_SERVICE_ACCOUNT_JSON,
    gcpServiceAccountFile: process.env.GCP_SERVICE_ACCOUNT_FILE,
    gcpSheetsScopes: parseList(process.env.GCP_SHEETS_SCOPES, ["https://www.googleapis.com/auth/spreadsheets"]),
  };

  if (config.aiProvider === "API" && !config.openaiApiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY (for AI_PROVIDER=API)");
  }

  return config;
}

module.exports = {
  loadConfig,
  parseBool,
};
