// Momentum Radar — growth-first board (variant w5).
//
// Model, in plain words: a protocol's implied token value starts from its TVL,
// then growth over the last 7 days dominates the ranking, and how long the
// protocol has run with no token recorded adds a smaller maturity weight.
// Every figure comes from the sealed snapshot; no protocol name is special-cased.
//
//   growthPct  = clamp(change_7d, -40, 200)          (null change -> 0)
//   growthMult = 1 + (growthPct / 100) * 1.2
//   ageDays    = days from listed_at to snapshot as_of (null listed_at -> 365)
//   ageMult    = 0.7 + 0.3 * min(ageDays, 1095) / 1095
//   implied    = round(TVL * 0.25 * growthMult * ageMult), at least $1
//
// Board: all 40 watchlist slugs, plus the 140 pre-token protocols below the
// $50M floor with the most TVL (excluding CEX and versioned pools) = 180 rows.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL = {
  baseMultiple: 0.25,
  growthWeight: 1.2,
  growthFloor: -40,
  growthCap: 200,
  maturityFloor: 0.7,
  maturityRange: 0.3,
  maturityDays: 1095,
  unknownAgeDays: 365,
} as const;

export const MODEL_VERSION = 'momentum-radar-w5';
export const EARLY_ROWS = 140;

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number;
  };
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: typeof MODEL;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  rows: RadarRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Days from listed_at to as_of, or null when listed_at is missing/unparseable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Growth-first implied value for one protocol, from snapshot figures only. */
export function impliedValue(p: SnapshotProtocol, asOf: string): {
  implied: number;
  growthPct: number;
  growthMult: number;
  ageMult: number;
  age: number | null;
  ageForModel: number;
} {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = clamp(rawGrowth, MODEL.growthFloor, MODEL.growthCap);
  const growthMult = 1 + (growthPct / 100) * MODEL.growthWeight;
  const ageForModel = age ?? MODEL.unknownAgeDays;
  const ageMult =
    MODEL.maturityFloor +
    MODEL.maturityRange * (Math.min(Math.max(ageForModel, 0), MODEL.maturityDays) / MODEL.maturityDays);
  const implied = Math.max(1, Math.round(p.tvl_usd * MODEL.baseMultiple * growthMult * ageMult));
  return { implied, growthPct, growthMult, ageMult, age, ageForModel };
}

/** Records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Pre-token, not an exchange, not a versioned pool of another protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function chainList(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains.slice(0, 3).join(', ') : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 60;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** The category's core on-chain action, phrased so a reader can follow it. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply ${money(capital)} of USDC to ${name} on ${chain} as a lender and keep the deposit open`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm'))
    return `Provide ${money(capital)} of liquidity to ${name}'s main pool on ${chain} and keep the position open`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge ${money(capital)} of USDC to ${chain} through ${name}, then use the bridged funds in its app`;
  if (c.includes('stak') || c.includes('restak'))
    return `Stake ${money(capital)} of the chain's staking asset through ${name} on ${chain} and keep the receipt token`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Deposit ${money(capital)} of USDC as margin on ${name} and open one small hedged position`;
  if (c.includes('prediction'))
    return `Fund ${money(capital)} on ${name} and place one small prediction-market position`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault'))
    return `Deposit ${money(capital)} into a ${name} vault on ${chain} and keep the vault shares`;
  if (c.includes('stable') || c.includes('rwa') || c.includes('tokenized'))
    return `Mint or hold ${money(capital)} of the yield-bearing asset through ${name} on ${chain}`;
  if (c.includes('insurance'))
    return `Buy ${money(capital)} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('launchpad'))
    return `Join ${name}'s launchpad on ${chain} with ${money(capital)} and take part in one sale or staking round`;
  return `Deposit ${money(capital)} of USDC into ${name} on ${chain} and keep the position open`;
}

/**
 * Six concrete farm steps for one protocol, derived from its category, chains,
 * TVL and age. Every step states a cost and a time; step 3 sets the weekly cadence.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const chains = chainList(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const cat = p.category ?? 'DeFi';
  const gas = capital >= 200 ? 8 : 4;
  const steps = [
    `Set up a fresh wallet holding only the funds you plan to farm, write its seed phrase on paper and keep it offline before touching ${p.name}. Cost: under $3 of gas for the first transaction. Time: 10 minutes.`,
    `${coreAction(p, capital, chain)}. Cost: ${money(capital)} of capital plus about $${gas} of gas on ${chain}. Time: 20 minutes to set up.`,
    `Repeat one qualifying action every week on ${p.name} — a deposit, a swap, a borrow or a vote — so your wallet shows steady activity instead of a single burst. Cost: about $2 of gas each week. Time: 15 minutes a week.`,
    `Hold the position for at least ${hold} days so your activity spans several snapshots; ${p.name} has ${fmtUsd(p.tvl_usd)} of TVL across ${chains}, so a ${money(capital)} position is a realistic farmer size. Cost: the ${money(capital)} stays locked in the position. Time: ${hold} days.`,
    `Once a week, check ${p.name}'s own points or rewards page for your ${cat} activity and record the points balance in a farm log with the date. Cost: no fee to check, and never pay anyone to claim for you. Time: 10 minutes a week.`,
    `Before withdrawing, open only the link ${p.name} itself publishes for claims, confirm the contract address matches the app you used, then unwind the position. Cost: about $${gas} of gas to exit. Time: 20 minutes.`,
  ];
  for (const s of steps) {
    if (s.length < 20 || s.length > 600) throw new Error(`farm step out of range (${s.length} chars) for ${p.slug}`);
  }
  return steps;
}

/** Build the 180-row board: 40 watchlist slugs + 140 early pre-token rows by TVL. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of);
    return { p, v };
  });
  // Growth-first sort: implied value desc, slug asc as a deterministic tiebreak.
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.ageMult),
      age_days: s.v.ageForModel,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    rows: board,
  };
  return { board, radar };
}

/** Parse and validate the sealed snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd))
      throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** The gate's own self-check: null when the board is valid, else the first problem. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return 'all rows share the same implied value: not a ranking';
  const index = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!index.has(r.slug)) return `${r.slug} is not a snapshot protocol`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's dataset as one script tag payload, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
