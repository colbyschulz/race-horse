import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewForm } from "../review-form";

const onSaved = vi.fn();
const onDiscarded = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  global.confirm = vi.fn(() => true) as typeof confirm;
});

const payload = {
  is_training_plan: true,
  title: "From File",
  sport: "run" as const,
  mode: "indefinite" as const,
  goal: null,
  tentative_start_date: "2026-05-04",
  workouts: [
    {
      day_offset: 0,
      sport: "run" as const,
      type: "easy" as const,
      distance_meters: 5000,
      duration_seconds: null,
      target_intensity: null,
      intervals: null,
      notes: "",
    },
    {
      day_offset: 6,
      sport: "run" as const,
      type: "long" as const,
      distance_meters: 16000,
      duration_seconds: null,
      target_intensity: null,
      intervals: null,
      notes: "",
    },
  ],
};

describe("ReviewForm", () => {
  it("renders the extracted plan title as the heading and defaults the active toggle on when no active plan", () => {
    render(
      <ReviewForm
        fileId="f1"
        payload={payload}
        units="mi"
        today="2026-04-27"
        hasActivePlan={false}
        onSaved={onSaved}
        onDiscarded={onDiscarded}
      />
    );
    expect(screen.getByRole("heading", { name: "From File" })).toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: /Set active/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("Save POSTs to the save endpoint with the payload values", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ plan_id: "p1" }) });
    render(
      <ReviewForm
        fileId="f1"
        payload={payload}
        units="mi"
        today="2026-04-27"
        hasActivePlan={false}
        onSaved={onSaved}
        onDiscarded={onDiscarded}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plans/upload/f1/save");
    const body = JSON.parse((opts as { body: string }).body);
    expect(body).toMatchObject({
      title: "From File",
      sport: "run",
      mode: "indefinite",
      start_date: "2026-05-04",
      set_active: true,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));
  });

  it("Discard DELETEs and calls onDiscarded", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    render(
      <ReviewForm
        fileId="f1"
        payload={payload}
        units="mi"
        today="2026-04-27"
        hasActivePlan
        onSaved={onSaved}
        onDiscarded={onDiscarded}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Discard/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Yes/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/plans/upload/f1",
        expect.objectContaining({ method: "DELETE" })
      )
    );
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled());
  });
});
