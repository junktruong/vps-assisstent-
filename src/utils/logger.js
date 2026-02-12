const fs = require("fs");
const path = require("path");

function setupLogging(logFilePath = path.join(process.cwd(), "logs", "app.log")) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  const stream = fs.createWriteStream(logFilePath, { flags: "a" });

  function write(level, message, meta = undefined) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {}),
    };

    const line = JSON.stringify(entry);
    stream.write(line + "\n");

    if (level === "error" || level === "warn") {
      console.error(line);
      return;
    }
    console.log(line);
  }

  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    debug: (message, meta) => write("debug", message, meta),
  };
}

module.exports = { setupLogging };
