import { requestUrl } from "obsidian";

export interface MetricEntry {
  type: string;
  object: any;
}

export interface MetricsResponse {
  data?: {
    metric_data?: MetricEntry[];
  };
  error?: string;
  status?: number;
}

const API_BASE = "https://partner.ultrahuman.com/api/v1";

/** Backoff delays (ms) between retries when the API returns HTTP 429. */
const RATE_LIMIT_BACKOFF_MS = [5000, 15000, 45000];
/** Longest wait a Retry-After header can ask for before we cap it. */
const MAX_RETRY_AFTER_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (delay seconds or an HTTP date) into ms. */
function retryAfterMs(headers: Record<string, string>): number | null {
  const entry = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === "retry-after"
  );
  if (!entry || !entry[1]) return null;
  const seconds = Number(entry[1]);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(entry[1]);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return null;
}

export class UltrahumanApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UltrahumanApiError";
    this.status = status;
  }
}

/**
 * Fetch a day's metrics from the Ultrahuman Partner API.
 *
 * Rate-limited responses (HTTP 429) are retried up to three times with
 * exponential backoff, honoring a Retry-After header when one is sent.
 *
 * @param apiKey Partner API key (sent as the Authorization header).
 * @param email  Email of the Ultrahuman account to fetch data for.
 * @param date   Date in YYYY-MM-DD format.
 */
export async function fetchMetrics(
  apiKey: string,
  email: string,
  date: string
): Promise<MetricEntry[]> {
  const params = new URLSearchParams({ email, date });
  const url = `${API_BASE}/metrics?${params.toString()}`;

  const request = () =>
    requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      throw: false,
    });

  let response = await request();
  for (
    let attempt = 0;
    response.status === 429 && attempt < RATE_LIMIT_BACKOFF_MS.length;
    attempt++
  ) {
    await sleep(retryAfterMs(response.headers) ?? RATE_LIMIT_BACKOFF_MS[attempt]);
    response = await request();
  }

  if (response.status === 429) {
    throw new UltrahumanApiError(
      "Ultrahuman API rate limit reached (HTTP 429). Retries were exhausted; wait a few minutes before syncing again.",
      response.status
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new UltrahumanApiError(
      "Authentication failed. Check your Partner API key in the plugin settings.",
      response.status
    );
  }
  if (response.status >= 400) {
    let detail = "";
    try {
      detail = response.json?.error ?? response.text ?? "";
    } catch {
      // ignore body parse failures
    }
    throw new UltrahumanApiError(
      `Ultrahuman API request failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }

  const body: MetricsResponse = response.json;
  const metrics = body?.data?.metric_data;
  if (!Array.isArray(metrics)) {
    throw new UltrahumanApiError(
      "Unexpected response from the Ultrahuman API (no metric data found).",
      response.status
    );
  }
  return metrics;
}
