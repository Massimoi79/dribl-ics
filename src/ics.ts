import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { Config, Fixture } from "./types.js";

export function buildIcs(fixtures: Fixture[], config: Config): string {
  const cal = ical({
    name: config.calendarName,
    description: `Auto-generated from ${config.subdomain}.dribl.com. Last refreshed ${new Date().toISOString()}.`,
    timezone: config.timezone,
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: "dribl-ics", product: "dribl-ics", language: "EN" },
    ttl: 60 * 60 * 12,
  });

  for (const fx of fixtures) {
    const start = new Date(fx.kickoff);
    const end = fx.endsAt
      ? new Date(fx.endsAt)
      : new Date(start.getTime() + config.matchDurationMinutes * 60_000);

    const summaryParts = [`${fx.homeTeam} vs ${fx.awayTeam}`];
    if (fx.round) summaryParts.push(`(${fx.round})`);
    const summary = summaryParts.join(" ");

    const locationParts: string[] = [];
    if (fx.venue) locationParts.push(fx.venue);
    if (fx.field && fx.field !== fx.venue) locationParts.push(fx.field);
    if (fx.address) locationParts.push(fx.address);
    const location = locationParts.join(", ") || undefined;

    const descLines: string[] = [];
    if (fx.competition) descLines.push(`Competition: ${fx.competition}`);
    if (fx.round) descLines.push(`Round: ${fx.round}`);
    descLines.push(`Home: ${fx.homeTeam}`);
    descLines.push(`Away: ${fx.awayTeam}`);
    if (fx.venue) descLines.push(`Venue: ${fx.venue}${fx.field ? ` (${fx.field})` : ""}`);
    if (fx.status) descLines.push(`Status: ${fx.status}`);

    let status: ICalEventStatus | undefined;
    const s = (fx.status ?? "").toLowerCase();
    if (s.includes("cancel") || s.includes("forfeit") || s.includes("abandon")) {
      status = ICalEventStatus.CANCELLED;
    } else if (s.includes("postpon") || s.includes("tentative") || s.includes("tba")) {
      status = ICalEventStatus.TENTATIVE;
    } else {
      // pending, confirmed, scheduled, in_progress, completed, etc.
      status = ICalEventStatus.CONFIRMED;
    }

    cal.createEvent({
      id: `${fx.id}@dribl-ics`,
      start,
      end,
      summary,
      description: descLines.join("\n"),
      location,
      timezone: config.timezone,
      status,
    });
  }

  return cal.toString();
}
