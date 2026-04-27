// src/extraction/format.ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Messages } from "@anthropic-ai/sdk/resources/messages/index.js";

type ContentBlock = Messages.ContentBlockParam;

const EXTRACTION_INSTRUCTION =
  "Extract the training plan above into the structured schema. " +
  "Express each workout's date as `day_offset` (0-indexed integer) from the plan's start. " +
  "If the file gives an explicit start date, set `tentative_start_date`; otherwise leave it null. " +
  "If this isn't a training plan, set `is_training_plan: false` and leave the rest as empty defaults.";

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

function bufferToText(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buf);
}

export async function formatForClaude(
  buf: ArrayBuffer,
  mime: string,
  filename: string,
): Promise<ContentBlock[]> {
  if (mime === "application/pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bufferToBase64(buf),
        },
      },
      { type: "text", text: `Filename: ${filename}` },
      { type: "text", text: EXTRACTION_INSTRUCTION },
    ];
  }

  if (mime === "text/csv") {
    const text = bufferToText(buf);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed as { data: unknown[] }).data;
    return [
      {
        type: "text",
        text: `Filename: ${filename}\n\nCSV rows (${rows.length}):\n${JSON.stringify(rows, null, 2)}\n\n${EXTRACTION_INSTRUCTION}`,
      },
    ];
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [`Filename: ${filename}`, ""];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
      parts.push(`Sheet: ${name}`);
      parts.push(JSON.stringify(rows, null, 2));
      parts.push("");
    }
    parts.push(EXTRACTION_INSTRUCTION);
    return [{ type: "text", text: parts.join("\n") }];
  }

  if (mime === "text/markdown" || mime === "text/plain") {
    const text = bufferToText(buf);
    return [
      { type: "text", text: `Filename: ${filename}\n\n${text}\n\n${EXTRACTION_INSTRUCTION}` },
    ];
  }

  throw new Error(`unsupported mime type: ${mime}`);
}
