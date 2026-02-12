const fs = require("fs/promises");
const { google } = require("googleapis");
const { z } = require("zod");

function parseServiceAccountFromEnv(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      throw new Error("GCP_SERVICE_ACCOUNT_JSON is not valid JSON/base64 JSON");
    }
  }
}

function createGsheetSkills(config) {
  const readRangeArgsSchema = z.object({
    spreadsheet_id: z.string().min(1),
    range: z.string().min(1),
    major_dimension: z.enum(["ROWS", "COLUMNS"]).optional(),
  });

  const writeRangeArgsSchema = z.object({
    spreadsheet_id: z.string().min(1),
    range: z.string().min(1),
    values: z.array(z.array(z.any())),
    value_input_option: z.enum(["RAW", "USER_ENTERED"]).default("RAW"),
  });

  const appendRowsArgsSchema = z.object({
    spreadsheet_id: z.string().min(1),
    range: z.string().min(1),
    values: z.array(z.array(z.any())),
    value_input_option: z.enum(["RAW", "USER_ENTERED"]).default("RAW"),
    insert_data_option: z.enum(["OVERWRITE", "INSERT_ROWS"]).default("INSERT_ROWS"),
  });

  let sheetsClientPromise = null;

  async function getSheetsClient() {
    if (sheetsClientPromise) {
      return sheetsClientPromise;
    }

    sheetsClientPromise = (async () => {
      let credentials = null;
      let keyFile = null;

      if (config.gcpServiceAccountJson) {
        credentials = parseServiceAccountFromEnv(config.gcpServiceAccountJson);
      } else if (config.gcpServiceAccountFile) {
        keyFile = config.gcpServiceAccountFile;
        await fs.access(keyFile);
      } else {
        throw new Error("Google Sheets credentials are not configured");
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        keyFile,
        scopes: config.gcpSheetsScopes,
      });

      return google.sheets({ version: "v4", auth });
    })();

    return sheetsClientPromise;
  }

  return [
    {
      name: "gsheet.read_range",
      description: "Read values from a Google Sheets range.",
      argsSchema: readRangeArgsSchema,
      argsSpec: {
        type: "object",
        required: ["spreadsheet_id", "range"],
        properties: {
          spreadsheet_id: { type: "string" },
          range: { type: "string" },
          major_dimension: { type: "string", enum: ["ROWS", "COLUMNS"] },
        },
      },
      run: async (args) => {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: args.spreadsheet_id,
          range: args.range,
          majorDimension: args.major_dimension,
        });

        return {
          range: response.data.range,
          majorDimension: response.data.majorDimension,
          values: response.data.values || [],
        };
      },
    },
    {
      name: "gsheet.write_range",
      description: "Overwrite values in a Google Sheets range.",
      argsSchema: writeRangeArgsSchema,
      argsSpec: {
        type: "object",
        required: ["spreadsheet_id", "range", "values"],
        properties: {
          spreadsheet_id: { type: "string" },
          range: { type: "string" },
          values: { type: "array" },
          value_input_option: { type: "string", enum: ["RAW", "USER_ENTERED"], default: "RAW" },
        },
      },
      run: async (args) => {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.update({
          spreadsheetId: args.spreadsheet_id,
          range: args.range,
          valueInputOption: args.value_input_option,
          requestBody: {
            values: args.values,
          },
        });

        return {
          updatedRange: response.data.updatedRange,
          updatedRows: response.data.updatedRows,
          updatedColumns: response.data.updatedColumns,
          updatedCells: response.data.updatedCells,
        };
      },
    },
    {
      name: "gsheet.append_rows",
      description: "Append rows to a Google Sheets range.",
      argsSchema: appendRowsArgsSchema,
      argsSpec: {
        type: "object",
        required: ["spreadsheet_id", "range", "values"],
        properties: {
          spreadsheet_id: { type: "string" },
          range: { type: "string" },
          values: { type: "array" },
          value_input_option: { type: "string", enum: ["RAW", "USER_ENTERED"], default: "RAW" },
          insert_data_option: { type: "string", enum: ["OVERWRITE", "INSERT_ROWS"], default: "INSERT_ROWS" },
        },
      },
      run: async (args) => {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId: args.spreadsheet_id,
          range: args.range,
          valueInputOption: args.value_input_option,
          insertDataOption: args.insert_data_option,
          requestBody: {
            values: args.values,
          },
        });

        return {
          tableRange: response.data.tableRange,
          updates: response.data.updates || {},
        };
      },
    },
  ];
}

module.exports = {
  createGsheetSkills,
};
