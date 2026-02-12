const fs = require("fs/promises");
const path = require("path");
const { z } = require("zod");

function isPathInside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveWorkspacePath(workspaceRoot, userPath) {
  const resolved = path.resolve(workspaceRoot, userPath);
  if (resolved === workspaceRoot || isPathInside(workspaceRoot, resolved)) {
    return resolved;
  }
  throw new Error("Path is outside workspace and blocked by fs safety guard");
}

function createFsSkills({ workspaceRoot }) {
  const readArgsSchema = z.object({
    path: z.string().min(1),
    encoding: z.string().default("utf8"),
    max_chars: z.number().int().positive().max(50000).default(12000),
  });

  const writeArgsSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
    mode: z.enum(["overwrite", "append"]).default("overwrite"),
    encoding: z.string().default("utf8"),
  });

  const patchArgsSchema = z.object({
    path: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
    replace_all: z.boolean().default(false),
    encoding: z.string().default("utf8"),
  });

  return [
    {
      name: "fs.read",
      description: "Read a file from workspace.",
      argsSchema: readArgsSchema,
      argsSpec: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          encoding: { type: "string", default: "utf8" },
          max_chars: { type: "number", default: 12000 },
        },
      },
      run: async (args) => {
        const resolvedPath = resolveWorkspacePath(workspaceRoot, args.path);
        const content = await fs.readFile(resolvedPath, args.encoding);
        const text = String(content);
        return {
          path: resolvedPath,
          content: text.slice(0, args.max_chars),
          truncated: text.length > args.max_chars,
          length: text.length,
        };
      },
    },
    {
      name: "fs.write",
      description: "Write text into a file in workspace.",
      argsSchema: writeArgsSchema,
      argsSpec: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          mode: { type: "string", enum: ["overwrite", "append"], default: "overwrite" },
          encoding: { type: "string", default: "utf8" },
        },
      },
      run: async (args) => {
        const resolvedPath = resolveWorkspacePath(workspaceRoot, args.path);
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

        if (args.mode === "append") {
          await fs.appendFile(resolvedPath, args.content, args.encoding);
        } else {
          await fs.writeFile(resolvedPath, args.content, args.encoding);
        }

        return {
          path: resolvedPath,
          bytes: Buffer.byteLength(args.content, args.encoding),
          mode: args.mode,
        };
      },
    },
    {
      name: "fs.patch",
      description: "Replace text in a file inside workspace.",
      argsSchema: patchArgsSchema,
      argsSpec: {
        type: "object",
        required: ["path", "find", "replace"],
        properties: {
          path: { type: "string" },
          find: { type: "string" },
          replace: { type: "string" },
          replace_all: { type: "boolean", default: false },
          encoding: { type: "string", default: "utf8" },
        },
      },
      run: async (args) => {
        const resolvedPath = resolveWorkspacePath(workspaceRoot, args.path);
        const original = await fs.readFile(resolvedPath, args.encoding);
        const source = String(original);

        if (!source.includes(args.find)) {
          throw new Error("Pattern not found in file");
        }

        let updated;
        let replacements;
        if (args.replace_all) {
          const escaped = args.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(escaped, "g");
          const matches = source.match(regex);
          replacements = matches ? matches.length : 0;
          updated = source.replace(regex, args.replace);
        } else {
          replacements = 1;
          updated = source.replace(args.find, args.replace);
        }

        await fs.writeFile(resolvedPath, updated, args.encoding);

        return {
          path: resolvedPath,
          replacements,
        };
      },
    },
  ];
}

module.exports = {
  createFsSkills,
  resolveWorkspacePath,
};
