// src/extraction/__tests__/format.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("papaparse", () => ({
  default: { parse: vi.fn() },
}));
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { formatForClaude } from "../format";

describe("formatForClaude", () => {
  it("PDF → document block (base64) + text block with filename", async () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer; // "%PDF" header
    const blocks = await formatForClaude(buf, "application/pdf", "plan.pdf");
    expect(blocks).toHaveLength(3); // document, filename text, instruction text
    expect(blocks[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
    const textBlocks = blocks.filter((b) => b.type === "text") as Array<{ type: "text"; text: string }>;
    expect(textBlocks[0].text).toContain("plan.pdf");
  });

  it("CSV → text block with parsed rows", async () => {
    const csv = "date,type,distance\n2026-05-04,easy,5000\n";
    const buf = new TextEncoder().encode(csv).buffer;
    (Papa.parse as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ date: "2026-05-04", type: "easy", distance: "5000" }],
    });
    const blocks = await formatForClaude(buf, "text/csv", "plan.csv");
    expect(blocks[0]).toMatchObject({ type: "text" });
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("plan.csv");
    expect(t.text).toContain("2026-05-04");
  });

  it("XLSX → text block with rows per sheet", async () => {
    const buf = new ArrayBuffer(8);
    (XLSX.read as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      SheetNames: ["S1"],
      Sheets: { S1: {} },
    });
    (XLSX.utils.sheet_to_json as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { day: 1, type: "easy" },
    ]);
    const blocks = await formatForClaude(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "plan.xlsx",
    );
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("S1");
    expect(t.text).toContain("easy");
  });

  it("Markdown / text → text block as-is", async () => {
    const md = "# Plan\nWeek 1, Day 1: Easy 5k";
    const buf = new TextEncoder().encode(md).buffer;
    const blocks = await formatForClaude(buf, "text/markdown", "plan.md");
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("# Plan");
    expect(t.text).toContain("plan.md");
  });

  it("rejects unsupported mime", async () => {
    const buf = new ArrayBuffer(8);
    await expect(formatForClaude(buf, "image/png", "plan.png")).rejects.toThrow(/unsupported/i);
  });
});
