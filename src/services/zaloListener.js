const express = require("express");
const path = require("path");
const ZaloBot = require("node-zalo-bot");

function normalizePathFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/webhook";
  } catch {
    return "/webhook";
  }
}

class ZaloBotService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.app = express();
    this.handlers = [];
    this.artifactResolver = null;

    this.bot = new ZaloBot(config.zaloBotToken, {
      polling: false,
    });

    this.webhookPath = normalizePathFromUrl(config.zaloWebhookUrl);

    this.app.use(express.json({ limit: "3mb" }));
    this.app.post(this.webhookPath, this.handleWebhook.bind(this));
    if (this.webhookPath !== "/zalo-webhook") {
      this.app.post("/zalo-webhook", this.handleWebhook.bind(this));
    }
    this.app.get("/zalo-artifacts/:artifactId", this.handleArtifact.bind(this));

    this.bot.on("message", (msg, metadata) => {
      void this.dispatchMessage(msg, metadata);
    });

    this.bot.on("error", (err) => {
      this.logger.error("Zalo bot error", { error: err.message });
    });
  }

  addMessageHandler(handler) {
    this.handlers.push(handler);
  }

  setArtifactResolver(resolver) {
    this.artifactResolver = resolver;
  }

  async start() {
    await new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.logger.info("Zalo service started", {
          host: this.config.host,
          port: this.config.port,
          webhookPath: this.webhookPath,
        });
        resolve();
      });
    });

    await this.registerWebhook();
  }

  async stop() {
    if (!this.server) {
      return;
    }
    await new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async registerWebhook() {
    try {
      await this.bot.setWebHook(this.config.zaloWebhookUrl, {
        secret_token: this.config.zaloWebhookSecret,
      });
      this.logger.info("Webhook configured successfully", {
        url: this.config.zaloWebhookUrl,
      });
    } catch (err) {
      this.logger.error("Webhook registration failed", {
        error: err.message,
      });
      throw err;
    }
  }

  verifySecret(req) {
    const incoming = req.headers["x-bot-api-secret-token"];
    return incoming && String(incoming) === this.config.zaloWebhookSecret;
  }

  async handleWebhook(req, res) {
    try {
      if (!this.verifySecret(req)) {
        this.logger.warn("Unauthorized webhook request", {
          path: req.path,
        });
        res.status(403).json({ message: "Unauthorized" });
        return;
      }

      const update = req.body;
      this.bot.processUpdate(update);
      res.sendStatus(200);
    } catch (err) {
      this.logger.error("Webhook handling failed", {
        error: err.message,
      });
      res.status(500).json({ message: "Internal server error" });
    }
  }

  async dispatchMessage(msg, metadata) {
    const text = msg?.text;
    const chatId = msg?.chat?.id ?? msg?.from?.id;

    if (!text || !chatId) {
      return;
    }

    await Promise.all(
      this.handlers.map((handler) =>
        Promise.resolve(handler(String(text), String(chatId), { msg, metadata })).catch((err) => {
          this.logger.error("Message handler failed", {
            error: err.message,
            chatId,
          });
        })
      )
    );
  }

  async handleArtifact(req, res) {
    try {
      if (!this.artifactResolver) {
        res.status(404).json({ ok: false, error: "Artifact resolver not ready" });
        return;
      }

      const artifactPath = await this.artifactResolver(req.params.artifactId);
      if (!artifactPath) {
        res.status(404).json({ ok: false, error: "Artifact not found" });
        return;
      }

      res.sendFile(path.resolve(artifactPath));
    } catch (err) {
      this.logger.error("Artifact serving failed", {
        error: err.message,
        artifactId: req.params.artifactId,
      });
      res.status(500).json({ ok: false, error: "Artifact error" });
    }
  }

  async sendResponse(chatId, text) {
    await this.bot.sendMessage(chatId, String(text));
  }

  async sendImage(chatId, imageUrl, caption = "") {
    const fallbackText = `${caption}\n${imageUrl}`.trim();

    if (typeof this.bot.sendPhoto === "function") {
      try {
        await this.bot.sendPhoto(chatId, imageUrl, caption ? { caption } : undefined);
        return;
      } catch (err) {
        this.logger.warn("sendPhoto failed, fallback to text link", {
          error: err.message,
        });
      }
    }

    await this.bot.sendMessage(chatId, fallbackText);
  }
}

module.exports = {
  ZaloBotService,
};
