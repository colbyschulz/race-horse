import { NextResponse, after } from "next/server";
import { handleWebhookEvent } from "@/strava/webhook";
import type { StravaWebhookEvent } from "@/strava/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const expected = process.env.STRAVA_VERIFY_TOKEN;

  if (mode !== "subscribe" || !challenge || !expected || verifyToken !== expected) {
    return NextResponse.json({ error: "verification failed" }, { status: 403 });
  }
  return NextResponse.json({ "hub.challenge": challenge });
}

export async function POST(req: Request) {
  let event: StravaWebhookEvent;
  try {
    event = (await req.json()) as StravaWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  after(async () => {
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      console.error("strava webhook handler failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
