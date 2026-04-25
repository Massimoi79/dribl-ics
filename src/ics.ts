import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { Config, Fixture } from "./types.js";

export function buildIcs(fixtures: Fixture[], config: Config): string {
  // We deliberately do NOT set a per-event `timezone` here. ical-generator v7
  // dropped its built-in timezone conversion; setting `timezone` without
  // installing a converter plugin emits raw UTC clock-digits relabelled as
  // local time, which produces a ~10h-wrong result on subscriber devices.
  // Instead we emit DTSTART/DTEND in UTC (suffixed with `Z`) — every calendar
  // client (iOS, Google, Outlook) converts UTC to the viewer's local zone
  // automatically.
  const cal = ical({
    name: config.calendarName,
    description: `Auto-generated from ${config.subdomain}.dribl.com. Last refreshed ${new Date().toISOString()}.`,
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
      status,
    });
  }

  return cal.toString();
}
