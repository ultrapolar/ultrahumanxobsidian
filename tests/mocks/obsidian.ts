import { vi } from "vitest";

/**
 * Runtime stub for the `obsidian` package, which only ships type
 * declarations. Tests configure `requestUrl` per-case via
 * `requestUrl.mockResolvedValue(...)`.
 */
export const requestUrl = vi.fn();
