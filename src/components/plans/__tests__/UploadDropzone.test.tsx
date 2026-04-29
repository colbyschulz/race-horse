// src/components/plans/__tests__/UploadDropzone.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadDropzone } from "../UploadDropzone";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function makeFile(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("UploadDropzone", () => {
  it("rejects unsupported file type with inline error", async () => {
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile("a.png", 100, "image/png")] });
    fireEvent.change(input);
    expect(await screen.findByText(/unsupported/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversize file", async () => {
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [makeFile("p.pdf", 11 * 1024 * 1024, "application/pdf")],
    });
    fireEvent.change(input);
    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
  });

  it("on accepted file: POSTs to /api/plans/upload, fires extract, navigates to review", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "f1" }) }) // upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // extract
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile("p.pdf", 100, "application/pdf")] });
    fireEvent.change(input);

    // Wait for the upload POST to resolve and navigation to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plans/upload",
      expect.objectContaining({ method: "POST" })
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(pushMock).toHaveBeenCalledWith("/plans/upload/f1/review");
  });
});
