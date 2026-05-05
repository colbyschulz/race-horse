import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunCoach = vi.fn();
vi.mock("@/server/coach/runner", () => ({ runCoach: (...args: unknown[]) => mockRunCoach(...args) }));

const mockFetchPreload = vi.fn();
vi.mock("@/server/coach/strava-preload", () => ({
  fetchStravaPreload: (...args: unknown[]) => mockFetchPreload(...args),
}));

const mockCreatePlan = vi.fn();
vi.mock("@/server/plans/queries", () => ({
  createPlan: (...args: unknown[]) => mockCreatePlan(...args),
}));

const mockDbSelect = vi.fn();
const mockDbDelete = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

vi.mock("@/server/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/server/auth";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
  mockFetchPreload.mockResolvedValue({
    athlete_summary: {
      four_week: { count: 1, total_distance_meters: 1, total_moving_time_seconds: 1, by_type: {} },
      twelve_week: { count: 1, total_distance_meters: 1, total_moving_time_seconds: 1, by_type: {} },
      fifty_two_week: { count: 1, total_distance_meters: 1, total_moving_time_seconds: 1, by_type: {} },
    },
    recent_activities_summary: { count: 0, total_distance_meters: 0, total_moving_time_seconds: 0 },
    minimal: false,
  });
  mockRunCoach.mockImplementation(async function* () {
    yield { type: "done", message_id: "m1" };
  });
  mockCreatePlan.mockResolvedValue({ id: "stub-plan-id" });
  mockDbSelect.mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([{ preferences: null }]) }) }),
  });
  mockDbDelete.mockReturnValue({ where: () => Promise.resolve() });
});

describe("POST /api/coach/build", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "indefinite" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when sport is missing", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal_type: "indefinite" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when race goal_type is missing race_date or race_event", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "race" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls runCoach with formatted form, preload, and coldStartBuild=true", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport: "run",
        goal_type: "race",
        race_date: "2026-04-20",
        race_event: "Boston Marathon",
        target_time: "sub-3:00",
        weekly_mileage: 45,
        weekly_mileage_unit: "mi",
        context: "Hilly course",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Drain the body so the runner gets called.
    const reader = res.body!.getReader();
    while (!(await reader.read()).done) {}

    expect(mockFetchPreload).toHaveBeenCalledWith("u1");
    expect(mockCreatePlan).toHaveBeenCalledTimes(1);
    const planArgs = mockCreatePlan.mock.calls[0];
    expect(planArgs[0]).toBe("u1");
    expect(planArgs[1]).toMatchObject({
      title: "Boston Marathon",
      sport: "run",
      mode: "goal",
      end_date: "2026-04-20",
      generation_status: "generating",
    });
    expect(mockRunCoach).toHaveBeenCalledTimes(1);
    const args = mockRunCoach.mock.calls[0][0];
    expect(args.userId).toBe("u1");
    expect(args.coldStartBuild).toBe(true);
    expect(args.planId).toBe("stub-plan-id");
    expect(args.stravaPreload).toBeDefined();
    expect(args.message).toContain("<!-- build_form_request -->");
    expect(args.message).toContain("**Sport:** Run");
    expect(args.message).toContain("Boston Marathon");
    expect(args.message).toContain("**Weekly mileage:** 45 mi");
  });

  it("emits plan-created as the first SSE event", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "indefinite" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await new Response(res.body).text();
    const firstEventLine = text.split("\n\n")[0]?.split("\n").find((l) => l.startsWith("data: "));
    expect(firstEventLine).toBeDefined();
    const firstEvent = JSON.parse(firstEventLine!.slice(6));
    expect(firstEvent).toEqual({ type: "plan-created", plan_id: "stub-plan-id" });
  });

  it("returns 400 when weekly_mileage is provided without a valid unit", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "indefinite", weekly_mileage: 40 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekly_mileage is negative", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport: "run",
        goal_type: "indefinite",
        weekly_mileage: -5,
        weekly_mileage_unit: "mi",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
