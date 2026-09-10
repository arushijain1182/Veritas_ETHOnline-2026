import { MarketStatus } from "../config/contracts";

const LABEL: Record<MarketStatus, string> = {
  [MarketStatus.OPEN]: "Open",
  [MarketStatus.CLOSED]: "Closed",
  [MarketStatus.RESOLVED]: "Resolved",
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  const label = LABEL[status] ?? "Unknown";
  return (
    <span className={`status-badge status-badge--${label.toLowerCase()}`}>
      <span className="status-badge__dot" />
      <span>{label}</span>
    </span>
  );
}
