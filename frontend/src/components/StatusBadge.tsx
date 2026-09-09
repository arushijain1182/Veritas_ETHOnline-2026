import { MarketStatus } from "../config/contracts";

const LABEL: Record<MarketStatus, string> = {
  [MarketStatus.OPEN]: "Open",
  [MarketStatus.CLOSED]: "Closed",
  [MarketStatus.RESOLVED]: "Resolved",
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  return <span className={`status-badge status-badge--${LABEL[status].toLowerCase()}`}>{LABEL[status]}</span>;
}
