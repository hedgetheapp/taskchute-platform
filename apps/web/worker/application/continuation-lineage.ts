export interface ContinuationEntryNode {
  id: string;
  continuation_chain_id: string | null;
  continuation_parent_entry_id: string | null;
  estimate_seconds: number | null;
}

export interface ContinuationLineageTombstone {
  deleted_entry_id: string;
  continuation_chain_id: string;
  continuation_parent_entry_id: string | null;
  root_estimate_seconds: number | null;
}

export interface ContinuationLineageAnalysis {
  valid: boolean;
  rootEstimateSeconds: number | null;
  liveDescendantIds: Set<string>;
  requiredTombstoneIds: Set<string>;
}

/** Validates ancestry without treating tombstones as visible Entries or actuals. */
export function analyzeContinuationLineage(
  chainId: string,
  entries: ContinuationEntryNode[],
  tombstones: ContinuationLineageTombstone[],
): ContinuationLineageAnalysis {
  const nodes = new Map<string, { parentId: string | null; rootEstimateSeconds: number | null; deleted: boolean }>();
  let valid = chainId.length > 0;
  for (const entry of entries) {
    if (entry.continuation_chain_id !== chainId || nodes.has(entry.id)) {
      valid = false;
      continue;
    }
    nodes.set(entry.id, { parentId: entry.continuation_parent_entry_id, rootEstimateSeconds: null, deleted: false });
  }
  for (const tombstone of tombstones) {
    if (tombstone.continuation_chain_id !== chainId || nodes.has(tombstone.deleted_entry_id)) {
      valid = false;
      continue;
    }
    if (tombstone.deleted_entry_id !== chainId && tombstone.root_estimate_seconds !== null) valid = false;
    nodes.set(tombstone.deleted_entry_id, {
      parentId: tombstone.continuation_parent_entry_id,
      rootEstimateSeconds: tombstone.root_estimate_seconds,
      deleted: true,
    });
  }

  const root = nodes.get(chainId);
  if (!root || root.parentId !== null) valid = false;
  for (const [id, node] of nodes) {
    if (id === chainId) continue;
    if (node.parentId === null || !nodes.has(node.parentId)) valid = false;
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && cursor !== chainId) {
      if (visited.has(cursor)) {
        valid = false;
        break;
      }
      visited.add(cursor);
      const current = nodes.get(cursor);
      if (!current) {
        valid = false;
        break;
      }
      cursor = current.parentId;
    }
    if (cursor !== chainId) valid = false;
  }

  const requiredTombstoneIds = new Set<string>();
  const liveDescendantIds = new Set<string>();
  for (const entry of entries) {
    const visited = new Set<string>();
    let cursor: string | null = entry.id;
    while (cursor !== null && cursor !== chainId && !visited.has(cursor)) {
      visited.add(cursor);
      if (cursor !== entry.id) liveDescendantIds.add(cursor);
      const node = nodes.get(cursor);
      if (!node) break;
      if (node.deleted) requiredTombstoneIds.add(cursor);
      cursor = node.parentId;
    }
    if (cursor === chainId && entry.id !== chainId) {
      liveDescendantIds.add(chainId);
      if (root?.deleted) requiredTombstoneIds.add(chainId);
    }
  }
  const actualTombstoneIds = new Set(tombstones.map((row) => row.deleted_entry_id));
  if (actualTombstoneIds.size !== requiredTombstoneIds.size
    || [...actualTombstoneIds].some((id) => !requiredTombstoneIds.has(id))) valid = false;

  return {
    valid,
    rootEstimateSeconds: root?.deleted ? root.rootEstimateSeconds : entries.find((entry) => entry.id === chainId)?.estimate_seconds ?? null,
    liveDescendantIds,
    requiredTombstoneIds,
  };
}

export async function loadContinuationLineage(
  db: D1Database,
  appUserId: string,
  chainId: string,
): Promise<{ entries: ContinuationEntryNode[]; tombstones: ContinuationLineageTombstone[]; analysis: ContinuationLineageAnalysis }> {
  const [entryResult, tombstoneResult] = await db.batch([
    db.prepare(`SELECT id, continuation_chain_id, continuation_parent_entry_id, estimate_seconds
      FROM entries WHERE app_user_id = ? AND continuation_chain_id = ? ORDER BY id`).bind(appUserId, chainId),
    db.prepare(`SELECT deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds
      FROM continuation_lineage_tombstones WHERE app_user_id = ? AND continuation_chain_id = ? ORDER BY deleted_entry_id`)
      .bind(appUserId, chainId),
  ]);
  const entries = entryResult.results as ContinuationEntryNode[];
  const tombstones = tombstoneResult.results as ContinuationLineageTombstone[];
  return { entries, tombstones, analysis: analyzeContinuationLineage(chainId, entries, tombstones) };
}

/** Reads the approved root baseline and actuals from live Executions only. */
export async function readContinuationChainEstimate(
  db: D1Database,
  appUserId: string,
  chainId: string,
  nowInstant: string,
): Promise<{ valid: boolean; baselineEstimateSeconds: number | null; cumulativeActualSeconds: number }> {
  const { entries, analysis } = await loadContinuationLineage(db, appUserId, chainId);
  if (!analysis.valid || entries.length === 0) {
    return { valid: false, baselineEstimateSeconds: null, cumulativeActualSeconds: 0 };
  }
  const actuals = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN x.ended_at IS NULL
      THEN unixepoch(?) - unixepoch(x.started_at)
      ELSE unixepoch(x.ended_at) - unixepoch(x.started_at) END), 0) AS cumulative_actual_seconds
    FROM entries e LEFT JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
    WHERE e.app_user_id = ? AND e.continuation_chain_id = ?`)
    .bind(nowInstant, appUserId, chainId).first<{ cumulative_actual_seconds: number }>();
  return {
    valid: actuals !== null && Number.isFinite(actuals.cumulative_actual_seconds) && actuals.cumulative_actual_seconds >= 0,
    baselineEstimateSeconds: analysis.rootEstimateSeconds,
    cumulativeActualSeconds: actuals?.cumulative_actual_seconds ?? 0,
  };
}
