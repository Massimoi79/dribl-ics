import type { Fixture } from "./types.js";

type Json = unknown;

const KICKOFF_KEYS = [
  "kickoff_at",
  "kickoff",
  "kicks_off_at",
  "start_at",
  "start_time",
  "starts_at",
  "scheduled_at",
  "scheduled_for",
  "match_at",
  "datetime",
  "date_time",
  "fixture_date",
  "date",
];
const END_KEYS = ["ends_at", "end_at", "end_time", "finish_at"];
const HOME_KEYS = ["home_team", "home", "homeTeam", "home_club", "home_squad"];
const AWAY_KEYS = ["away_team", "away", "awayTeam", "away_club", "away_squad"];
const NAME_KEYS = ["name", "title", "display_name", "label", "long_name", "short_name", "club_name", "team_name"];
const ID_KEYS = ["hashid", "id", "uuid", "match_id", "fixture_id", "code"];
const VENUE_KEYS = ["venue", "ground", "location", "field"];
const FIELD_KEYS = ["field", "pitch", "court"];
const ADDRESS_KEYS = ["address", "address_full", "street", "formatted_address"];
const COMP_KEYS = ["competition", "grade", "league", "tournament", "comp"];
const ROUND_KEYS = ["round", "round_label", "round_name", "round_number", "stage"];
const STATUS_KEYS = ["status", "state", "match_status"];

function isObject(v: Json): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined && obj[k] !== "") {
      return obj[k];
    }
  }
  return undefined;
}

function toStringName(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (isObject(v)) {
    const name = pick(v, NAME_KEYS);
    if (typeof name === "string") return name;
    // Some Dribl shapes nest the club inside the team, e.g. team: { club: { name } }
    const club = (v as Record<string, unknown>)["club"];
    if (isObject(club)) {
      const cn = pick(club, NAME_KEYS);
      if (typeof cn === "string") return cn;
    }
  }
  return undefined;
}

function toIso(v: unknown): string | undefined {
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return undefined;
  }
  if (typeof v === "number") {
    // Heuristic: seconds vs ms
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function toId(obj: Record<string, unknown>): string | undefined {
  const id = pick(obj, ID_KEYS);
  if (typeof id === "string" && id) return id;
  if (typeof id === "number") return String(id);
  return undefined;
}

/** Heuristic: does this object look like a single fixture/match? */
function looksLikeFixture(obj: Record<string, unknown>): boolean {
  const hasKickoff = KICKOFF_KEYS.some((k) => k in obj);
  const hasHome = HOME_KEYS.some((k) => k in obj);
  const hasAway = AWAY_KEYS.some((k) => k in obj);
  return hasKickoff && hasHome && hasAway;
}

function normalize(obj: Record<string, unknown>): Fixture | null {
  const kickoff = toIso(pick(obj, KICKOFF_KEYS));
  const home = toStringName(pick(obj, HOME_KEYS));
  const away = toStringName(pick(obj, AWAY_KEYS));
  if (!kickoff || !home || !away) return null;

  const id = toId(obj) ?? `${home}-${away}-${kickoff}`.replace(/\s+/g, "_");
  const endsAt = toIso(pick(obj, END_KEYS));

  const venueRaw = pick(obj, VENUE_KEYS);
  const venue = toStringName(venueRaw);

  let field: string | undefined;
  if (isObject(venueRaw)) {
    const f = pick(venueRaw, FIELD_KEYS);
    if (typeof f === "string") field = f;
  }
  if (!field) {
    const f = pick(obj, FIELD_KEYS);
    if (typeof f === "string") field = f;
  }

  let address: string | undefined;
  if (isObject(venueRaw)) {
    const a = pick(venueRaw, ADDRESS_KEYS);
    if (typeof a === "string") address = a;
  }
  if (!address) {
    const a = pick(obj, ADDRESS_KEYS);
    if (typeof a === "string") address = a;
  }

  const competition = toStringName(pick(obj, COMP_KEYS));

  let round: string | undefined;
  const roundRaw = pick(obj, ROUND_KEYS);
  if (typeof roundRaw === "string") round = roundRaw;
  else if (typeof roundRaw === "number") round = `Round ${roundRaw}`;
  else if (isObject(roundRaw)) round = toStringName(roundRaw);

  const status = toStringName(pick(obj, STATUS_KEYS));

  return {
    id,
    kickoff,
    endsAt,
    homeTeam: home,
    awayTeam: away,
    competition,
    round,
    venue,
    field,
    address,
    status,
  };
}

/** Recursively walk any JSON value collecting fixture-shaped objects. */
export function findFixtures(value: Json, out: Map<string, Fixture> = new Map()): Map<string, Fixture> {
  if (Array.isArray(value)) {
    for (const item of value) findFixtures(item, out);
    return out;
  }
  if (!isObject(value)) return out;

  if (looksLikeFixture(value)) {
    const fx = normalize(value);
    if (fx) {
      // De-duplicate by id (first occurrence wins; later pages won't override).
      if (!out.has(fx.id)) out.set(fx.id, fx);
    }
  }

  for (const v of Object.values(value)) findFixtures(v, out);
  return out;
}

/** Optional client-side filter to narrow fixtures down to one team. */
export function filterByTeam(fixtures: Fixture[], teamFilter: string | undefined): Fixture[] {
  if (!teamFilter) return fixtures;
  const needle = teamFilter.toLowerCase();
  return fixtures.filter((f) => {
    const haystack = [f.homeTeam, f.awayTeam, f.competition, f.round]
      .filter((x): x is string => typeof x === "string")
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sortByKickoff(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
