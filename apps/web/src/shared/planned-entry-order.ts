export interface CanonicalOrderEntry {
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
  position: number;
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
  const ordered: T[] = [];
  let plannedSegment: T[] = [];
  const flush = () => {
    ordered.push(...plannedSegment.sort(comparePlannedEntries));
    plannedSegment = [];
  };
  for (const entry of entries) {
    if (entry.lifecycle_state === "planned") plannedSegment.push(entry);
    else {
      flush();
      ordered.push(entry);
    }
  }
  flush();
  return ordered;
}

export function isSamePlannedStartCohort(left: CanonicalOrderEntry | undefined, right: CanonicalOrderEntry | undefined): boolean {
  return left?.lifecycle_state === "planned" && right?.lifecycle_state === "planned"
    && left.planned_start_minute === right.planned_start_minute;
}
