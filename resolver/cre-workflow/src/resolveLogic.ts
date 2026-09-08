import type { MarketRegistry } from "./config";

/**
 * TypeScript port of resolver/lib/resolveLogic.js's validation rules, so the
 * CRE workflow and the Stage 1 mock resolver reject the same malformed /
 * duplicate / unknown inputs. If you change the rules in one, change them
 * in the other.
 */

export type OfficialResult = {
  eventId: string;
  winner: string;
  timestamp: number;
};

export type ResolutionErrorCode =
  | "MALFORMED_RESULT"
  | "MALFORMED_EVENT_ID"
  | "UNKNOWN_EVENT_ID"
  | "UNKNOWN_WINNER"
  | "DUPLICATE_RESULT";

export class ResolutionError extends Error {
  code: ResolutionErrorCode;
  constructor(code: ResolutionErrorCode, message: string) {
    super(message);
    this.name = "ResolutionError";
    this.code = code;
  }
}

export type Resolution = { marketId: number; winningOption: number; eventId: string };

export function mapResultToResolution(
  result: OfficialResult | undefined | null,
  registry: MarketRegistry,
  alreadyResolvedEventIds: ReadonlySet<string> = new Set()
): Resolution {
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
    throw new ResolutionError("UNKNOWN_EVENT_ID", `No market registered for eventId "${eventId}"`);
  }

  const winningOption = marketEntry.options.findIndex(
    (option) => option.toUpperCase() === winner.toUpperCase()
  );
  if (winningOption === -1) {
    throw new ResolutionError(
      "UNKNOWN_WINNER",
      `Winner "${winner}" is not one of [${marketEntry.options.join(", ")}] for eventId "${eventId}"`
    );
  }

  return { marketId: marketEntry.marketId, winningOption, eventId };
}
