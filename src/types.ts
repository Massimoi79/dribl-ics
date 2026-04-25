export interface Config {
  subdomain: string;
  club?: string;
  season: string;
  competition?: string;
  league?: string;
  teamFilter?: string;
  timezone: string;
  calendarName: string;
  matchDurationMinutes: number;
  outputPath: string;
}

export interface Fixture {
  /** Stable identifier (used as iCal UID). */
  id: string;
  /** Kickoff time as ISO 8601 (with offset). */
  kickoff: string;
  /** Optional explicit end time; if absent we derive from matchDurationMinutes. */
  endsAt?: string;
  homeTeam: string;
  awayTeam: string;
  /** Competition / grade label, e.g. "Senior Men State League 2 NW". */
  competition?: string;
  /** Round label, e.g. "Round 5" or "Semi Final". */
  round?: string;
  /** Venue / ground name. */
  venue?: string;
  /** Optional pitch / field within the venue. */
  field?: string;
  /** Optional address for the venue. */
  address?: string;
  /** Status (Scheduled, Postponed, Cancelled, etc). */
  status?: string;
}
