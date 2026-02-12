const fs = require("fs/promises");
const path = require("path");
const { Worker } = require("worker_threads");
const { randomUUID } = require("crypto");
const { SessionStateStore } = require("../domain/sessionState");
const { createAIAdapter } = require("../infra/aiFactory");
const { createSkillRegistry } = require("../infra/skillRegistry");

function isPathInside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

class ZaloAgentBridge {
  constructor({ zaloService, config, logger }) {
    this.zaloService = zaloService;
    this.config = config;
    this.logger = logger;

    this.aiAdapter = createAIAdapter(config, logger);
    this.skillRegistry = createSkillRegistry(config);
    this.stateStore = new SessionStateStore(config.agentStateFile, logger);
    this.queue = [];
    this.processing = false;
    this.artifacts = new Map();

    this.zaloService.setArtifactResolver(async (artifactId) => this.artifacts.get(artifactId) || null);
  }

  async init() {
    await this.stateStore.load();
  }

  onMessageReceived(text, chatId) {
    this.queue.push({ text, chatId });
    void this.drainQueue();
  }

  async drainQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }

      try {
        const result = await this.runWorker(job.text, job.chatId);
        await this.deliver(job.chatId, result);
      } catch (err) {
        this.logger.error("Worker job failed", {
          chatId: job.chatId,
          error: err.message,
        });
        await this.zaloService.sendResponse(
          job.chatId,
          "Xin lỗi, hệ thống agent đang lỗi khi xử lý yêu cầu. Bạn thử lại sau."
        );
      }
    }

    this.processing = false;
  }

  async runWorker(text, chatId) {
    const workerPath = path.resolve(__dirname, "../workers/agentWorker.js");

    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          messageText: text,
          chatId,
          config: {
            aiProvider: this.config.aiProvider,
            openaiApiKey: this.config.openaiApiKey,
            openaiModel: this.config.openaiModel,
            playwrightCliBin: this.config.playwrightCliBin,
            chatgptUrl: this.config.chatgptUrl,
            chatgptSession: this.config.chatgptSession,
            chatgptBrowserHeaded: this.config.chatgptBrowserHeaded,
            chatgptResponseTimeoutMs: this.config.chatgptResponseTimeoutMs,
            chatgptIdlePollMs: this.config.chatgptIdlePollMs,
            chatgptPromptSelector: this.config.chatgptPromptSelector,
            chatgptResponseSelector: this.config.chatgptResponseSelector,
            agentMaxSteps: this.config.agentMaxSteps,
            agentStateFile: this.config.agentStateFile,
            workspaceRoot: this.config.workspaceRoot,
            gcpServiceAccountJson: this.config.gcpServiceAccountJson,
            gcpServiceAccountFile: this.config.gcpServiceAccountFile,
            gcpSheetsScopes: this.config.gcpSheetsScopes,
          },
        },
      });

      worker.once("message", (message) => {
        if (!message || message.ok !== true) {
          reject(new Error(message?.error || "Unknown worker error"));
          return;
        }
        resolve(message.result);
      });

      worker.once("error", (err) => {
        reject(err);
      });

      worker.once("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  async registerLocalArtifact(localPath) {
    const absolutePath = path.resolve(this.config.workspaceRoot, localPath);
    if (!(absolutePath === this.config.workspaceRoot || isPathInside(this.config.workspaceRoot, absolutePath))) {
      throw new Error("Artifact path outside workspace is blocked");
    }

    await fs.access(absolutePath);

    const artifactId = randomUUID();
    this.artifacts.set(artifactId, absolutePath);

    const artifact = {
      id: artifactId,
      local_path: absolutePath,
      url: `${this.config.publicBaseUrl}/zalo-artifacts/${artifactId}`,
    };

    await this.stateStore.setLastArtifact(artifact);
    return artifact;
  }

  formatFinalText(result) {
    const lines = [];
    lines.push(result.summary);

    if (Array.isArray(result.results) && result.results.length > 0) {
      lines.push("\nKết quả:");
      for (const row of result.results.slice(0, 10)) {
        if (typeof row === "string") {
          lines.push(`- ${row}`);
        } else {
          lines.push(`- ${JSON.stringify(row)}`);
        }
      }
    }

    if (Array.isArray(result.next_steps) && result.next_steps.length > 0) {
      lines.push("\nBước tiếp theo:");
      for (const step of result.next_steps.slice(0, 10)) {
        lines.push(`- ${step}`);
      }
    }

    return lines.join("\n").slice(0, 4000);
  }

  async deliver(chatId, result) {
    if (result.kind === "chat") {
      await this.zaloService.sendResponse(chatId, result.message);
      return;
    }

    if (result.kind === "ask_user") {
      const text = ["Mình cần thêm thông tin:", result.question, result.context || ""]
        .filter(Boolean)
        .join("\n");
      await this.zaloService.sendResponse(chatId, text);
      return;
    }

    await this.zaloService.sendResponse(chatId, this.formatFinalText(result));

    if (!Array.isArray(result.artifacts)) {
      return;
    }

    for (const artifact of result.artifacts) {
      let artifactUrl = artifact.url;
      if (!artifactUrl && artifact.local_path) {
        try {
          const registered = await this.registerLocalArtifact(artifact.local_path);
          artifactUrl = registered.url;
        } catch (err) {
          this.logger.warn("Artifact registration failed", {
            error: err.message,
            artifact: artifact.local_path,
          });
        }
      }

      if (!artifactUrl) {
        continue;
      }

      const label = artifact.label || "Artifact";
      if (artifact.type === "image") {
        await this.zaloService.sendImage(chatId, artifactUrl, label);
      } else {
        await this.zaloService.sendResponse(chatId, `${label}: ${artifactUrl}`);
      }
    }
  }
}

module.exports = {
  ZaloAgentBridge,
};
