export interface CanonicalOrderEntry {
  id?: string;
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
  position: number;
  first_started_at?: string | null;
  execution_summary?: { first_started_at: string | null };
}

function firstStartedAt(entry: CanonicalOrderEntry): string | null {
  return entry.first_started_at ?? entry.execution_summary?.first_started_at ?? null;
}

function compareHistoricalEntries(left: CanonicalOrderEntry, right: CanonicalOrderEntry): number {
  const leftStartedAt = firstStartedAt(left);
  const rightStartedAt = firstStartedAt(right);
  if (leftStartedAt === null && rightStartedAt !== null) return 1;
  if (leftStartedAt !== null && rightStartedAt === null) return -1;
  if (leftStartedAt !== rightStartedAt) return (leftStartedAt ?? "").localeCompare(rightStartedAt ?? "");
  if (left.position !== right.position) return left.position - right.position;
  return (left.id ?? "").localeCompare(right.id ?? "");
}

function comparePlannedEntries(left: CanonicalOrderEntry, right: CanonicalOrderEntry): number {
  if (left.planned_start_minute === null && right.planned_start_minute !== null) return -1;
  if (left.planned_start_minute !== null && right.planned_start_minute === null) return 1;
  if (left.planned_start_minute !== right.planned_start_minute) {
    return (left.planned_start_minute ?? 0) - (right.planned_start_minute ?? 0);
  }
  return left.position - right.position;
}

export function canonicalizeEntryOrder<T extends CanonicalOrderEntry>(entries: T[]): T[] {
  const historical = entries.filter((entry) => entry.lifecycle_state !== "planned").sort(compareHistoricalEntries);
  const planned = entries.filter((entry) => entry.lifecycle_state === "planned").sort(comparePlannedEntries);
  return [...historical, ...planned];
}

export function isSamePlannedStartCohort(left: CanonicalOrderEntry | undefined, right: CanonicalOrderEntry | undefined): boolean {
  return left?.lifecycle_state === "planned" && right?.lifecycle_state === "planned"
    && left.planned_start_minute === right.planned_start_minute;
}
