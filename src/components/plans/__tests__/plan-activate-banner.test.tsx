import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanActivateBanner } from "../plan-activate-banner";

const fetchMock = vi.fn();
const alertMock = vi.fn();

function renderBanner() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <PlanActivateBanner planId="p1" />
    </QueryClientProvider>
  );
  return { invalidate };
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  alertMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("alert", alertMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanActivateBanner", () => {
  it("says why the plan isn't showing and offers to make it active", () => {
    renderBanner();
    expect(screen.getByText("Not on your calendar")).toBeInTheDocument();
    expect(screen.getByText("Today and Training show your active plan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make active" })).toBeEnabled();
  });

  it("makes the plan active and re-reads what Today and Training show", async () => {
    const { invalidate } = renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Make active" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workouts"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plans"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plans/p1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ is_active: true });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("says so when the change doesn't go through", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Make active" }));

    await waitFor(() => expect(alertMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Make active" })).toBeEnabled();
  });
});
