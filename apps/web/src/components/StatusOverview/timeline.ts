import type { Incident, IncidentWindow } from '@cairn/shared';

/** UTC calendar days; merge intersections so duplicate/overlapping records cannot inflate downtime. */
export function dailyDowntime(window: IncidentWindow, incidents: Incident[]) {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const dayMs = 86_400_000;
  const days: { date: string; seconds: number }[] = [];
  for (let start = Math.floor(from / dayMs) * dayMs; start < to; start += dayMs) {
    const left = Math.max(start, from);
    const right = Math.min(start + dayMs, to);
    const intervals = incidents.map((incident): [number, number] => [
      Math.max(left, Date.parse(incident.startedAt)),
      Math.min(right, incident.resolvedAt ? Date.parse(incident.resolvedAt) : to),
    ]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let total = 0;
    let end = left;
    for (const [a, b] of intervals) {
      total += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
    days.push({ date: new Date(start).toISOString().slice(0, 10), seconds: total / 1000 });
  }
  return days;
}
