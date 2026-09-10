import { MarketStatus } from "./contracts";

export interface CampusMarket {
  id: number;
  question: string;
  options: string[];
  category: string;
  closeTime: bigint; // Unix timestamp in seconds
  resultAnnouncementTime: bigint; // Unix timestamp in seconds
  resultAnnouncement: string;
  resolutionOracle: string;
  totalPool: bigint; // in USDC base units (6 decimals)
  optionPools: bigint[]; // in USDC base units (6 decimals)
  studentCount: number; // Total number of students who invested
  optionStudentCounts: number[]; // Number of students who invested in each option
  status: MarketStatus;
  winningOption?: bigint;
  platformFeeBps: number; // 1000 = 10%
}

export interface UserInvestment {
  marketId: number;
  optionIndex: number;
  optionName: string;
  amount: bigint; // 6 decimals
  timestamp: number;
}

const STORAGE_KEY_MARKETS = "veritas_campus_markets_v1";
const STORAGE_KEY_INVESTMENTS = "veritas_user_investments_v1";

const NOW_SEC = BigInt(Math.floor(Date.now() / 1000));
const DAY_SEC = 86400n;

// Initial campus markets accurately reflecting IIT Delhi inter-hostel competitions and elections
export const INITIAL_CAMPUS_MARKETS: CampusMarket[] = [
  {
    id: 1,
    question: "Which hostel will win Women's FGC?",
    options: ["Himadri", "Kailash", "Nalanda", "Dronagiri", "Sahyadri"],
    category: "Sports",
    closeTime: NOW_SEC + DAY_SEC * 5n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 5n + 7200n,
    resultAnnouncement: "November 20, 2026, 7:00 PM IST (Immediately following Women's GC Athletics & Badminton Finals in Student Activity Complex)",
    resolutionOracle: "Chainlink CRE Verified Oracle & IITD Board for Sports Activities (BSA)",
    totalPool: 4200000000n, // 4,200 USDC
    optionPools: [
      1470000000n, // Himadri (35%)
      1260000000n, // Kailash (30%)
      630000000n,  // Nalanda (15%)
      504000000n,  // Dronagiri (12%)
      336000000n,  // Sahyadri (8%)
    ],
    studentCount: 184,
    optionStudentCounts: [68, 52, 28, 22, 14],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 2,
    question: "Which hostel will win BRCA Trophy?",
    options: ["Kumaon", "Jwalamukhi", "Shivalik", "Karakoram", "Zanskar"],
    category: "Cultural",
    closeTime: NOW_SEC + DAY_SEC * 7n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 7n + 10800n,
    resultAnnouncement: "November 25, 2026, 8:30 PM IST (BRCA Valedictory Ceremony & Cultural Night in Dogra Hall)",
    resolutionOracle: "Chainlink CRE Verified Oracle & Board for Recreational & Cultural Activities (BRCA)",
    totalPool: 6800000000n, // 6,800 USDC
    optionPools: [
      2040000000n, // Kumaon (30%)
      2380000000n, // Jwalamukhi (35%)
      1020000000n, // Shivalik (15%)
      816000000n,  // Karakoram (12%)
      544000000n,  // Zanskar (8%)
    ],
    studentCount: 312,
    optionStudentCounts: [94, 110, 46, 38, 24],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 3,
    question: "Which hostel will win CAIC Trophy?",
    options: ["Himadri", "Kailash", "Jwalamukhi", "Zanskar", "Aravali"],
    category: "Academic",
    closeTime: NOW_SEC + DAY_SEC * 12n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 12n + 7200n,
    resultAnnouncement: "December 2, 2026, 6:00 PM IST (CAIC Annual Convocation & Academic Council Awards)",
    resolutionOracle: "Chainlink CRE Verified Oracle & Co-curricular and Academic Interaction Council (CAIC)",
    totalPool: 3500000000n, // 3,500 USDC
    optionPools: [
      420000000n,  // Himadri (12%)
      700000000n,  // Kailash (20%)
      280000000n,  // Jwalamukhi (8%)
      1225000000n, // Zanskar (35%)
      875000000n,  // Aravali (25%)
    ],
    studentCount: 146,
    optionStudentCounts: [16, 30, 10, 54, 36],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 4,
    question: "Dance Secy will be from which hostel?",
    options: ["Himadri", "Kailash", "Jwalamukhi", "Zanskar", "Aravali"],
    category: "Elections",
    closeTime: NOW_SEC + DAY_SEC * 3n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 3n + 14400n,
    resultAnnouncement: "October 30, 2026, 11:00 PM IST (SAC Election Declaration Night in SAC Amphitheatre)",
    resolutionOracle: "Chainlink CRE Verified Oracle & SAC Election Commission",
    totalPool: 2900000000n, // 2,900 USDC
    optionPools: [
      725000000n,  // Himadri (25%)
      1160000000n, // Kailash (40%)
      435000000n,  // Jwalamukhi (15%)
      232000000n,  // Zanskar (8%)
      348000000n,  // Aravali (12%)
    ],
    studentCount: 168,
    optionStudentCounts: [42, 68, 26, 12, 20],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 5,
    question: "Which hostel will win BHM Trophy?",
    options: ["Nilgiri", "Girnar", "Udaigiri", "Satpura", "Vindhyachal"],
    category: "Other",
    closeTime: NOW_SEC + DAY_SEC * 15n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 15n + 7200n,
    resultAnnouncement: "December 10, 2026, 5:00 PM IST (Board of Hostel Management Annual Review & Dinner)",
    resolutionOracle: "Chainlink CRE Verified Oracle & Board of Hostel Management (BHM)",
    totalPool: 2400000000n, // 2,400 USDC
    optionPools: [
      600000000n, // Nilgiri (25%)
      840000000n, // Girnar (35%)
      480000000n, // Udaigiri (20%)
      288000000n, // Satpura (12%)
      192000000n, // Vindhyachal (8%)
    ],
    studentCount: 115,
    optionStudentCounts: [30, 42, 22, 13, 8],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 6,
    question: "Which hostel will win General Championship (Sports)?",
    options: ["Zanskar", "Kumaon", "Jwalamukhi", "Aravali", "Karakoram"],
    category: "Sports",
    closeTime: NOW_SEC + DAY_SEC * 9n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 9n + 10800n,
    resultAnnouncement: "November 28, 2026, 7:30 PM IST (BSA Annual Sports Day Closing Ceremony & Trophy Handover)",
    resolutionOracle: "Chainlink CRE Verified Oracle & Board for Sports Activities (BSA)",
    totalPool: 8500000000n, // 8,500 USDC
    optionPools: [
      3400000000n, // Zanskar (40%)
      2550000000n, // Kumaon (30%)
      1275000000n, // Jwalamukhi (15%)
      765000000n,  // Aravali (9%)
      510000000n,  // Karakoram (6%)
    ],
    studentCount: 420,
    optionStudentCounts: [170, 125, 65, 38, 22],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 7,
    question: "General Secy SAC will be from which hostel?",
    options: ["Kumaon", "Nilgiri", "Girnar", "Shivalik", "Jwalamukhi"],
    category: "Elections",
    closeTime: NOW_SEC + DAY_SEC * 3n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 3n + 16200n,
    resultAnnouncement: "October 30, 2026, 11:30 PM IST (SAC Executive Election Counting & Results in SAC Lawns)",
    resolutionOracle: "Chainlink CRE Verified Oracle & SAC Election Commission",
    totalPool: 5600000000n, // 5,600 USDC
    optionPools: [
      2016000000n, // Kumaon (36%)
      1568000000n, // Nilgiri (28%)
      616000000n,  // Girnar (11%)
      392000000n,  // Shivalik (7%)
      1008000000n, // Jwalamukhi (18%)
    ],
    studentCount: 290,
    optionStudentCounts: [105, 82, 32, 19, 52],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
  {
    id: 8,
    question: "Which hostel will win Rendezvous Overall Trophy?",
    options: ["Himadri", "Kailash", "Nalanda", "Dronagiri", "Sahyadri"],
    category: "Cultural",
    closeTime: NOW_SEC + DAY_SEC * 4n,
    resultAnnouncementTime: NOW_SEC + DAY_SEC * 4n + 7200n,
    resultAnnouncement: "October 25, 2026, 10:00 PM IST (Rendezvous Final Pronite Announcement in OAT)",
    resolutionOracle: "Chainlink CRE Verified Oracle & Rendezvous Festival Coordination Committee",
    totalPool: 4800000000n, // 4,800 USDC
    optionPools: [
      1920000000n, // Himadri (40%)
      1440000000n, // Kailash (30%)
      720000000n,  // Nalanda (15%)
      432000000n,  // Dronagiri (9%)
      288000000n,  // Sahyadri (6%)
    ],
    studentCount: 235,
    optionStudentCounts: [95, 70, 35, 21, 14],
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  },
];

// Pre-seeded investments for the user so they already have stakes in several campus markets!
export const INITIAL_USER_INVESTMENTS: UserInvestment[] = [
  {
    marketId: 1,
    optionIndex: 0,
    optionName: "Himadri",
    amount: 100000000n, // 100.00 USDC
    timestamp: Date.now() - 86400 * 1000 * 2,
  },
  {
    marketId: 2,
    optionIndex: 1,
    optionName: "Jwalamukhi",
    amount: 150000000n, // 150.00 USDC
    timestamp: Date.now() - 86400 * 1000 * 3,
  },
  {
    marketId: 3,
    optionIndex: 3,
    optionName: "Zanskar",
    amount: 75000000n, // 75.00 USDC
    timestamp: Date.now() - 86400 * 1000 * 1,
  },
  {
    marketId: 4,
    optionIndex: 1,
    optionName: "Kailash",
    amount: 80000000n, // 80.00 USDC
    timestamp: Date.now() - 86400 * 1000 * 1.5,
  },
  {
    marketId: 6,
    optionIndex: 0,
    optionName: "Zanskar",
    amount: 200000000n, // 200.00 USDC
    timestamp: Date.now() - 86400 * 1000 * 4,
  },
];

// Serializer / deserializer for BigInt in localStorage
function serializeBigInts(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? `${v.toString()}n` : v));
}

function parseBigInts<T>(str: string): T {
  return JSON.parse(str, (_, v) => {
    if (typeof v === "string" && /^-?\d+n$/.test(v)) {
      return BigInt(v.slice(0, -1));
    }
    return v;
  });
}

export function getCampusMarkets(): CampusMarket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MARKETS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_MARKETS, serializeBigInts(INITIAL_CAMPUS_MARKETS));
      return INITIAL_CAMPUS_MARKETS;
    }
    return parseBigInts<CampusMarket[]>(raw);
  } catch {
    return INITIAL_CAMPUS_MARKETS;
  }
}

export function getCampusMarket(id: number): CampusMarket | undefined {
  const all = getCampusMarkets();
  return all.find((m) => m.id === id);
}

export function getUserInvestments(): UserInvestment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVESTMENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_INVESTMENTS, serializeBigInts(INITIAL_USER_INVESTMENTS));
      return INITIAL_USER_INVESTMENTS;
    }
    return parseBigInts<UserInvestment[]>(raw);
  } catch {
    return INITIAL_USER_INVESTMENTS;
  }
}

export function getUserInvestmentForMarket(marketId: number): UserInvestment | undefined {
  const investments = getUserInvestments();
  return investments.find((inv) => inv.marketId === marketId);
}

export function recordCampusBet(marketId: number, optionIndex: number, amount: bigint): void {
  const markets = getCampusMarkets();
  const market = markets.find((m) => m.id === marketId);
  if (!market) return;

  const investments = getUserInvestments();
  const existingInv = investments.find((inv) => inv.marketId === marketId);

  // Update market pools & stats
  market.totalPool += amount;
  if (!market.optionPools[optionIndex]) market.optionPools[optionIndex] = 0n;
  market.optionPools[optionIndex] += amount;

  if (!market.optionStudentCounts[optionIndex]) market.optionStudentCounts[optionIndex] = 0;
  market.optionStudentCounts[optionIndex] += 1;

  if (!existingInv) {
    market.studentCount += 1;
    investments.push({
      marketId,
      optionIndex,
      optionName: market.options[optionIndex] ?? `Option ${optionIndex + 1}`,
      amount,
      timestamp: Date.now(),
    });
  } else {
    // If betting on same option, increase amount; if another option, update
    existingInv.amount += amount;
    existingInv.optionIndex = optionIndex;
    existingInv.optionName = market.options[optionIndex] ?? `Option ${optionIndex + 1}`;
    existingInv.timestamp = Date.now();
  }

  localStorage.setItem(STORAGE_KEY_MARKETS, serializeBigInts(markets));
  localStorage.setItem(STORAGE_KEY_INVESTMENTS, serializeBigInts(investments));

  // Dispatch custom event to notify React hooks/components
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("campus-market-update", { detail: { marketId } }));
  }
}

export function createCampusMarket(
  question: string,
  options: string[],
  category: string,
  closeTime: bigint
): number {
  const markets = getCampusMarkets();
  const nextId = markets.length > 0 ? Math.max(...markets.map((m) => m.id)) + 1 : 1;
  const newMarket: CampusMarket = {
    id: nextId,
    question,
    options,
    category,
    closeTime,
    resultAnnouncementTime: closeTime + 7200n,
    resultAnnouncement:
      new Date(Number(closeTime + 7200n) * 1000).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }) + " (IITD Student Affairs & Council Declaration)",
    resolutionOracle: "Chainlink CRE Verified Oracle & SAC / BSA Campus Council",
    totalPool: 0n,
    optionPools: options.map(() => 0n),
    studentCount: 0,
    optionStudentCounts: options.map(() => 0),
    status: MarketStatus.OPEN,
    platformFeeBps: 1000,
  };
  markets.push(newMarket);
  localStorage.setItem(STORAGE_KEY_MARKETS, serializeBigInts(markets));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("campus-market-update", { detail: { marketId: nextId } }));
  }
  return nextId;
}

export function resetCampusMarketsToDefaults(): void {
  localStorage.setItem(STORAGE_KEY_MARKETS, serializeBigInts(INITIAL_CAMPUS_MARKETS));
  localStorage.setItem(STORAGE_KEY_INVESTMENTS, serializeBigInts(INITIAL_USER_INVESTMENTS));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("campus-market-update"));
  }
}

