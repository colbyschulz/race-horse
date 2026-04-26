import { NextResponse } from "next/server";

const STRAVA_API = "https://www.strava.com/api/v3";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// GET — list current subscriptions for the configured Strava app
export async function GET(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");
  const url = new URL(STRAVA_API + "/push_subscriptions");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  const res = await fetch(url);
  return NextResponse.json(await res.json(), { status: res.status });
}

// POST — create a subscription. Body: { callback_url }
export async function POST(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  let body: { callback_url?: string };
  try {
    body = (await req.json()) as { callback_url?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { callback_url } = body;
  if (!callback_url) {
    return NextResponse.json({ error: "callback_url required" }, { status: 400 });
  }
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");
  const verifyToken = envOrThrow("STRAVA_VERIFY_TOKEN");

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("callback_url", callback_url);
  form.set("verify_token", verifyToken);

  const res = await fetch(STRAVA_API + "/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

// DELETE — remove subscription by id. Body: { id }
export async function DELETE(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  let body: { id?: number };
  try {
    body = (await req.json()) as { id?: number };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");

  const url = new URL(STRAVA_API + "/push_subscriptions/" + id);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);

  const res = await fetch(url, { method: "DELETE" });
  return NextResponse.json(
    res.status === 204 ? { ok: true } : await res.json().catch(() => ({})),
    { status: res.status },
  );
}
