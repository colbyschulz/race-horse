import { NextResponse } from "next/server";

// The JSON error responses every route handler shares.
export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
export const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });
export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });
