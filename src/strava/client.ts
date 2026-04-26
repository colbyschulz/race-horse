const STRAVA_BASE = "https://www.strava.com/api/v3";

export class StravaApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string,
  ) {
    super(`Strava API ${status} on ${url}: ${body.slice(0, 200)}`);
  }
}

interface FetchStravaOptions {
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchStrava<T>(
  path: string,
  token: string,
  opts: FetchStravaOptions = {},
): Promise<T> {
  const {
    params,
    method = "GET",
    body,
    maxRetries = 4,
    baseDelayMs = 500,
    signal,
  } = opts;

  let url = STRAVA_BASE + path;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += "?" + qs;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (e) {
      lastErr = e;
      if (attempt === maxRetries) throw e;
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      // Strava returns 204 for some delete-like calls.
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    const isRetryable = res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt === maxRetries) {
      throw new StravaApiError(res.status, await res.text(), url);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }

  throw lastErr ?? new Error("fetchStrava: exhausted retries");
}
