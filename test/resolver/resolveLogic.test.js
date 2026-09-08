const { expect } = require("chai");
const { mapResultToResolution, ResolutionError } = require("../../resolver/lib/resolveLogic");

describe("resolver/lib/resolveLogic", function () {
  const registry = {
    "IITD-CRICKET-2026-FINAL": { marketId: 1, options: ["HIMADRI", "KARAKORAM"] },
  };

  it("maps a correct winner to the right marketId + winningOption", function () {
    const result = { eventId: "IITD-CRICKET-2026-FINAL", winner: "HIMADRI", timestamp: 1 };
    const resolution = mapResultToResolution(result, registry);
    expect(resolution).to.deep.equal({
      marketId: 1,
      winningOption: 0,
      eventId: "IITD-CRICKET-2026-FINAL",
    });
  });

  it("is case-insensitive on the winner string", function () {
    const result = { eventId: "IITD-CRICKET-2026-FINAL", winner: "karakoram", timestamp: 1 };
    const resolution = mapResultToResolution(result, registry);
    expect(resolution.winningOption).to.equal(1);
  });

  it("rejects an unknown / malformed eventId", function () {
    const result = { eventId: "NOT-REGISTERED", winner: "HIMADRI" };
    expect(() => mapResultToResolution(result, registry)).to.throw(ResolutionError, /UNKNOWN_EVENT_ID|not registered|No market/i);
    try {
      mapResultToResolution(result, registry);
    } catch (e) {
      expect(e.code).to.equal("UNKNOWN_EVENT_ID");
    }
  });

  it("rejects a missing eventId field entirely", function () {
    const result = { winner: "HIMADRI" };
    try {
      mapResultToResolution(result, registry);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.code).to.equal("MALFORMED_EVENT_ID");
    }
  });

  it("rejects a winner that isn't one of the market's options", function () {
    const result = { eventId: "IITD-CRICKET-2026-FINAL", winner: "NORTHEAST" };
    try {
      mapResultToResolution(result, registry);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.code).to.equal("UNKNOWN_WINNER");
    }
  });

  it("rejects a duplicate result for an eventId already resolved", function () {
    const result = { eventId: "IITD-CRICKET-2026-FINAL", winner: "HIMADRI" };
    const alreadyResolved = new Set(["IITD-CRICKET-2026-FINAL"]);
    try {
      mapResultToResolution(result, registry, alreadyResolved);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.code).to.equal("DUPLICATE_RESULT");
    }
  });

  it("rejects a non-object result payload", function () {
    try {
      mapResultToResolution(null, registry);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.code).to.equal("MALFORMED_RESULT");
    }
  });
});
