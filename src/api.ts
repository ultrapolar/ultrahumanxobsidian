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

  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
    throw: false,
  });

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
