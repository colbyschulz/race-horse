// src/coach/tools/files.ts
import type { Anthropic } from "@anthropic-ai/sdk";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getPlanFileById } from "@/plans/files";
import { fetchPlanFileBytes } from "@/extraction/blob";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;
type Block = Anthropic.Messages.ContentBlockParam;

export const readUploadedFileTool: Tool = {
  name: "read_uploaded_file",
  description:
    "Read a previously uploaded training plan file. Use when the user wants help building a plan from a file that failed automatic extraction.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_file_id: { type: "string", description: "The UUID of the uploaded plan file." },
    },
    required: ["plan_file_id"],
  },
};

type Input = { plan_file_id: string };
type Output = { content: Block[]; error?: string };

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}
function bufferToText(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buf);
}

const MAX_ROWS = 500;

export const read_uploaded_file_handler: ToolHandler<Input, Output> = async (input, ctx) => {
  const row = await getPlanFileById(input.plan_file_id, ctx.userId);
  if (!row) {
    return { content: [], error: "plan_file not found or not owned by user" };
  }

  const buf = await fetchPlanFileBytes(row.blob_url);
  const filename = row.original_filename;

  if (row.mime_type === "application/pdf") {
    return {
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: bufferToBase64(buf) },
        },
        { type: "text", text: `Filename: ${filename}` },
      ],
    };
  }

  if (row.mime_type === "text/csv") {
    const text = bufferToText(buf);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed as { data: unknown[] }).data;
    const truncated = rows.slice(0, MAX_ROWS);
    const truncNote =
      rows.length > MAX_ROWS ? ` (showing first ${MAX_ROWS} of ${rows.length})` : "";
    return {
      content: [
        {
          type: "text",
          text: `Filename: ${filename}${truncNote}\n${JSON.stringify(truncated, null, 2)}`,
        },
      ],
    };
  }

  if (
    row.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    row.mime_type === "application/vnd.ms-excel"
  ) {
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [`Filename: ${filename}`];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
      const truncated = rows.slice(0, MAX_ROWS);
      const truncNote = rows.length > MAX_ROWS ? ` (first ${MAX_ROWS} of ${rows.length})` : "";
      parts.push(`Sheet: ${name}${truncNote}`);
      parts.push(JSON.stringify(truncated, null, 2));
    }
    return { content: [{ type: "text", text: parts.join("\n") }] };
  }

  if (row.mime_type === "text/markdown" || row.mime_type === "text/plain") {
    return { content: [{ type: "text", text: `Filename: ${filename}\n\n${bufferToText(buf)}` }] };
  }

  return { content: [], error: `unsupported mime: ${row.mime_type}` };
};
