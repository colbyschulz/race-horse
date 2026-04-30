"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch a JSON endpoint and parse it, throwing on non-2xx.
 * The response shape isn't validated at runtime — for internal APIs we trust the contract.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ApiError(`request failed (${res.status}) for ${url}`, res.status);
  }
  return (await res.json()) as T;
}
