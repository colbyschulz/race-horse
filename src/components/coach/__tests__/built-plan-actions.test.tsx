import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BuiltPlanActions } from "../built-plan-actions";

let plan: { id: string; is_active: boolean; generation_status: string };
const patches: unknown[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === "/api/plans/p1" && init?.method === "PATCH") {
    const body = JSON.parse(String(init.body));
    patches.push(body);
    plan = { ...plan, is_active: body.is_active };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (url === "/api/plans/p1") {
    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`unexpected fetch: ${url}`);
});

function renderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <BuiltPlanActions planId="p1" />
    </QueryClientProvider>
  );
  return { invalidate };
}

beforeEach(() => {
  plan = { id: "p1", is_active: false, generation_status: "complete" };
  patches.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BuiltPlanActions", () => {
  it("only links to the plan when it is already the active one", async () => {
    plan.is_active = true;
    renderActions();

    expect(screen.getByRole("link", { name: /View your plan/ })).toHaveAttribute(
      "href",
      "/plans/p1"
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Make this my active plan" })).toBeNull();
  });

  it("offers to make the plan active when another plan still is", async () => {
    const { invalidate } = renderActions();

    await userEvent.click(await screen.findByRole("button", { name: "Make this my active plan" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Make this my active plan" })).toBeNull()
    );
    expect(patches).toEqual([{ is_active: true }]);
    // Today and Training read the active plan and its workouts, so both are re-read.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plans"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workouts"] });
    expect(screen.getByRole("link", { name: /View your plan/ })).toBeInTheDocument();
  });

  it("doesn't offer it while the plan is still being built", async () => {
    plan.generation_status = "generating";
    renderActions();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Make this my active plan" })).toBeNull();
  });
});
