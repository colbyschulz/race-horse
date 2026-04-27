// src/components/plans/__tests__/InFlightUploadCard.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InFlightUploadCard } from "../InFlightUploadCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  global.confirm = vi.fn(() => true) as typeof confirm;
});

const baseRow = {
  id: "f1",
  status: "extracting" as const,
  original_filename: "plan.pdf",
  extraction_error: null as string | null,
};

describe("InFlightUploadCard", () => {
  it("extracting → renders spinner + filename + cancel", () => {
    render(<InFlightUploadCard row={baseRow} />);
    expect(screen.getByText(/Extracting/i)).toBeInTheDocument();
    expect(screen.getByText(/plan.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("extracted → renders Ready-to-review link", () => {
    render(<InFlightUploadCard row={{ ...baseRow, status: "extracted" }} />);
    const link = screen.getByRole("link", { name: /review/i });
    expect(link).toHaveAttribute("href", "/plans/upload/f1/review");
  });

  it("failed → shows error + Retry/Talk to coach/Discard", () => {
    render(<InFlightUploadCard row={{ ...baseRow, status: "failed", extraction_error: "boom" }} />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    const coachLink = screen.getByRole("link", { name: /coach/i });
    expect(coachLink).toHaveAttribute("href", "/coach?from=/plans&plan_file_id=f1");
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });
});
