import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { errorHandler } from "../src/backend/http/error-handler.js";
import { registerAttendanceRoute } from "../src/backend/http/attendance-route.js";
import type { AttendanceRelayConfig } from "../src/shared/config.js";

const cfg: AttendanceRelayConfig = {
  enabled: true,
  memoriaIngestUrl: "http://memoria.test",
  memoriaIngestKey: "ingest-secret",
  serviceKey: "relay-secret",
};

const validBody = {
  type: "attendance.checked_in",
  userId: "u_1",
  facilityId: "fac",
  checkedInAt: 1700000000000,
  reservationId: null,
  source: "aedilis",
};

function buildTestApp(c: AttendanceRelayConfig = cfg): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  registerAttendanceRoute(app, c);
  return app;
}

function post(app: Hono, body: unknown, headers: Record<string, string> = {}) {
  return app.request("/v1/attendance/checkin", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("attendance relay route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards to memoria with ingest key and returns 200", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const app = buildTestApp();

    const res = await post(app, validBody, {
      "x-attendance-service-key": "relay-secret",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      forwarded: true,
      memoriaStatus: 202,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://memoria.test/api/attendance/ingest");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-memoria-ingest-key"]).toBe("ingest-secret");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(validBody);
  });

  it("rejects missing service key with 401 and does not forward", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const app = buildTestApp();

    const res = await post(app, validBody);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects wrong service key with 401", async () => {
    const app = buildTestApp();
    const res = await post(app, validBody, {
      "x-attendance-service-key": "wrong",
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid payload with 400", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const app = buildTestApp();
    const res = await post(
      app,
      { ...validBody, source: "nope" },
      { "x-attendance-service-key": "relay-secret" },
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps memoria failure to 502 upstream_error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    const app = buildTestApp();
    const res = await post(app, validBody, {
      "x-attendance-service-key": "relay-secret",
    });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("upstream_error");
  });

  it("returns 403 when relay disabled (key configured but ingest unset)", async () => {
    const app = buildTestApp({ ...cfg, enabled: false });
    const res = await post(app, validBody, {
      "x-attendance-service-key": "relay-secret",
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when service key not configured", async () => {
    const app = buildTestApp({ ...cfg, serviceKey: "" });
    const res = await post(app, validBody, {
      "x-attendance-service-key": "relay-secret",
    });
    expect(res.status).toBe(403);
  });
});
