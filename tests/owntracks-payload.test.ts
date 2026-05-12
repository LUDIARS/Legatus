import { describe, it, expect } from "vitest";
import {
  parseOwntracksLocation,
  parseOwntracksTopic,
} from "../src/backend/owntracks/payload.js";

describe("parseOwntracksTopic", () => {
  it("parses standard topic", () => {
    expect(parseOwntracksTopic("owntracks/alice/iphone")).toEqual({
      user: "alice",
      device: "iphone",
    });
  });

  it("rejects wrong prefix", () => {
    expect(parseOwntracksTopic("foo/alice/iphone")).toBeNull();
  });

  it("rejects too few parts", () => {
    expect(parseOwntracksTopic("owntracks/alice")).toBeNull();
  });
});

describe("parseOwntracksLocation", () => {
  it("parses minimum fields", () => {
    expect(
      parseOwntracksLocation({ _type: "location", lat: 35.6, lon: 139.7, tst: 1700000000 }),
    ).toEqual({
      _type: "location",
      lat: 35.6,
      lon: 139.7,
      tst: 1700000000,
      acc: undefined,
      alt: undefined,
      batt: undefined,
      vel: undefined,
      cog: undefined,
      tid: undefined,
      conn: undefined,
    });
  });

  it("rejects out-of-range lat", () => {
    expect(parseOwntracksLocation({ _type: "location", lat: 91, lon: 0, tst: 1 })).toBeNull();
  });

  it("rejects non-location _type", () => {
    expect(parseOwntracksLocation({ _type: "transition", lat: 0, lon: 0, tst: 1 })).toBeNull();
  });

  it("rejects null / non-object", () => {
    expect(parseOwntracksLocation(null)).toBeNull();
    expect(parseOwntracksLocation("foo")).toBeNull();
  });
});
