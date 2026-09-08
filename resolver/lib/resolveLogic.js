"use strict";

/**
 * Pure, environment-agnostic mapping/validation logic shared by:
 *   - resolver/scripts/mockResolver.js (Stage 1 mock resolver)
 *   - resolver/cre-workflow (Stage 3 real CRE workflow re-implements the same
 *     checks in TypeScript against the CRE SDK's runtime — keep the two in
 *     sync if you change validation rules here)
 *
 * Takes an "official result" object and a market registry, and returns the
 * exact (marketId, winningOption) pair to submit to resolveMarket(), or
 * throws a typed error describing why the result can't be trusted /
 * resolved yet.
 */

class ResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ResolutionError";
    this.code = code;
  }
}

/**
 * @param {object} result - official result payload, e.g.
 *   { eventId, winner, timestamp }
 * @param {object} registry - eventId -> { marketId, options }
 * @param {Set<string>} [alreadyResolvedEventIds] - eventIds that have
 *   already been submitted on-chain; used to reject duplicate results.
 */
function mapResultToResolution(result, registry, alreadyResolvedEventIds = new Set()) {
  if (!result || typeof result !== "object") {
    throw new ResolutionError("MALFORMED_RESULT", "Result payload is missing or not an object");
  }

  const { eventId, winner } = result;

  if (!eventId || typeof eventId !== "string") {
    throw new ResolutionError("MALFORMED_EVENT_ID", "eventId is missing or not a string");
  }
  if (!winner || typeof winner !== "string") {
    throw new ResolutionError("MALFORMED_RESULT", "winner is missing or not a string");
  }

  if (alreadyResolvedEventIds.has(eventId)) {
    throw new ResolutionError(
      "DUPLICATE_RESULT",
      `Result for eventId "${eventId}" has already been resolved on-chain`
    );
  }

  const marketEntry = registry[eventId];
  if (!marketEntry) {
    throw new ResolutionError(
      "UNKNOWN_EVENT_ID",
      `No market is registered for eventId "${eventId}"`
    );
  }

  const winningOption = marketEntry.options.findIndex(
    (option) => option.toUpperCase() === winner.toUpperCase()
  );
  if (winningOption === -1) {
    throw new ResolutionError(
      "UNKNOWN_WINNER",
      `Winner "${winner}" is not one of the registered options [${marketEntry.options.join(", ")}] for eventId "${eventId}"`
    );
  }

  return { marketId: marketEntry.marketId, winningOption, eventId };
}

module.exports = { ResolutionError, mapResultToResolution };
