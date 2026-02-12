function stripCodeFence(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractFirstJsonObject(text) {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseJsonObject(rawText) {
  const candidates = [];
  const asText = String(rawText || "").trim();

  if (asText) {
    candidates.push(asText);
    candidates.push(stripCodeFence(asText));
  }

  const objectCandidate = extractFirstJsonObject(asText);
  if (objectCandidate) {
    candidates.push(objectCandidate);
    candidates.push(stripCodeFence(objectCandidate));
  }

  const unique = [...new Set(candidates.filter(Boolean))];

  let lastError = null;
  for (const candidate of unique) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      lastError = new Error("Expected JSON object");
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Cannot parse JSON object");
}

module.exports = {
  parseJsonObject,
};
