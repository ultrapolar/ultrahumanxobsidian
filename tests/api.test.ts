import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { fetchMetrics, UltrahumanApiError } from "../src/api";

const mockedRequestUrl = vi.mocked(requestUrl);

function respondWith(response: Partial<Record<string, unknown>>) {
  mockedRequestUrl.mockResolvedValue(response as any);
}

describe("fetchMetrics", () => {
  beforeEach(() => {
    mockedRequestUrl.mockReset();
  });

  it("requests the metrics endpoint with encoded params and auth header", async () => {
    respondWith({ status: 200, json: { data: { metric_data: [] } } });

    await fetchMetrics("secret-key", "user+ring@example.com", "2026-07-01");

    expect(mockedRequestUrl).toHaveBeenCalledOnce();
    const call = mockedRequestUrl.mock.calls[0][0] as any;
    expect(call.url).toBe(
      "https://partner.ultrahuman.com/api/v1/metrics?email=user%2Bring%40example.com&date=2026-07-01"
    );
    expect(call.method).toBe("GET");
    expect(call.headers).toEqual({
      Authorization: "secret-key",
      Accept: "application/json",
    });
    expect(call.throw).toBe(false);
  });

  it("returns the metric_data array on success", async () => {
    const metrics = [{ type: "hr", object: { values: [] } }];
    respondWith({ status: 200, json: { data: { metric_data: metrics } } });

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).resolves.toEqual(metrics);
  });

  it.each([401, 403])("throws an auth error for HTTP %i", async (status) => {
    respondWith({ status, json: {} });

    const promise = fetchMetrics("bad-key", "a@b.c", "2026-07-01");
    await expect(promise).rejects.toBeInstanceOf(UltrahumanApiError);
    await promise.catch((error: UltrahumanApiError) => {
      expect(error.status).toBe(status);
      expect(error.message).toMatch(/Authentication failed/);
    });
  });

  it("includes the API's error detail for other failures", async () => {
    respondWith({ status: 429, json: { error: "Rate limited" } });

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).rejects.toThrow(
      "Ultrahuman API request failed (HTTP 429): Rate limited"
    );
  });

  it("falls back to the response text when there is no JSON error", async () => {
    respondWith({ status: 500, json: {}, text: "Internal Server Error" });

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).rejects.toThrow(
      "Ultrahuman API request failed (HTTP 500): Internal Server Error"
    );
  });

  it("omits the detail when the error body cannot be parsed", async () => {
    const response: any = { status: 500 };
    Object.defineProperty(response, "json", {
      get() {
        throw new Error("invalid json");
      },
    });
    mockedRequestUrl.mockResolvedValue(response);

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).rejects.toThrow(
      "Ultrahuman API request failed (HTTP 500)"
    );
  });

  it("throws when a 200 response has no metric data", async () => {
    respondWith({ status: 200, json: { data: {} } });

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).rejects.toThrow(
      /no metric data found/
    );
  });

  it("throws when metric_data is not an array", async () => {
    respondWith({ status: 200, json: { data: { metric_data: { type: "hr" } } } });

    await expect(fetchMetrics("k", "a@b.c", "2026-07-01")).rejects.toThrow(
      /no metric data found/
    );
  });
});
