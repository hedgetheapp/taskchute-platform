import { useEffect, useState } from "react";
import type {
  DeleteEffectiveDayOverrideRequest,
  EffectiveDayCalendarProjection,
  EffectiveDayOverrideKind,
  UpsertEffectiveDayOverrideRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

type OverrideChoice = EffectiveDayOverrideKind | "none";

function kindLabel(kind: string): string {
  if (kind === "workday") return "営業日";
  if (kind === "holiday") return "休日";
  return "不明";
}

function operationError(error: unknown): string {
  return error instanceof Error ? error.message : "営業日カレンダーを保存できませんでした";
}

export function EffectiveDayCalendarSettings(props: { initialLogicalDate: string | null; disabled: boolean }) {
  const [calendar, setCalendar] = useState<EffectiveDayCalendarProjection | null>(null);
  const [selectedDate, setSelectedDate] = useState(props.initialLogicalDate ?? "");
  const [choice, setChoice] = useState<OverrideChoice>("none");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<UpsertEffectiveDayOverrideRequest | DeleteEffectiveDayOverrideRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(logicalDate: string) {
    if (!logicalDate) return;
    setLoading(true); setError(null);
    try {
      const result = await api.loadEffectiveDayCalendar(logicalDate);
      setCalendar(result);
      setChoice(result.classification.override?.override_kind ?? "none");
      setReason(result.classification.override?.reason ?? "");
    } catch (loadError) {
      setError(operationError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (props.initialLogicalDate && !calendar) void load(props.initialLogicalDate);
    // The selected date is intentionally loaded only on explicit date changes;
    // an unrelated Day refresh must not overwrite an in-progress draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialLogicalDate]);

  async function execute(request: UpsertEffectiveDayOverrideRequest | DeleteEffectiveDayOverrideRequest) {
    setOperation(request); setError(null); setNotice(null); setLoading(true);
    try {
      if ("override_kind" in request) await api.upsertEffectiveDayOverride(request);
      else await api.deleteEffectiveDayOverride(request);
      setOperation(null); setNotice("営業日カレンダーを保存しました。");
      await load(request.logical_date);
    } catch (saveError) {
      const ambiguous = saveError instanceof ApiClientError && saveError.code === "infrastructure_ambiguous";
      if (!ambiguous) setOperation(null);
      setError(operationError(saveError));
      if (!ambiguous && saveError instanceof ApiClientError && saveError.reconcile) await load(request.logical_date);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!calendar || !selectedDate || loading) return;
    const current = calendar.classification.override;
    if (choice === "none") {
      if (!current) {
        setNotice("指定休日・営業日扱いはありません。");
        return;
      }
      void execute({ operation_id: uuidv7(), logical_date: selectedDate, expected_revision: current.revision });
      return;
    }
    void execute({ operation_id: uuidv7(), logical_date: selectedDate, override_kind: choice,
      reason: reason.trim() || null, expected_revision: current?.revision ?? null });
  }

  return (
    <section className="effective-day-calendar-settings" aria-label="営業日・休日カレンダー設定">
      <div className="settings-section-heading">
        <div>
          <h2>営業日 / 休日カレンダー</h2>
          <p>公式の祝日情報と、あなたの指定休日・営業日扱いを確認・設定します。</p>
        </div>
      </div>
      {calendar && <p className="settings-capability-note">公式スナップショット対象: {calendar.coverage.start}〜{calendar.coverage.end}</p>}
      <div className="effective-day-calendar-form">
        <label>
          日付
          <input aria-label="カレンダー日付" type="date" value={selectedDate} disabled={props.disabled || loading}
            onChange={(event) => { setSelectedDate(event.target.value); void load(event.target.value); }} />
        </label>
        {calendar && (
          <div className="effective-day-calendar-facts" aria-live="polite">
            <div><span>基本判定</span><strong>{kindLabel(calendar.classification.base)}</strong></div>
            <div><span>有効判定</span><strong>{kindLabel(calendar.classification.effective)}</strong></div>
            {calendar.classification.official_entry && <div><span>公式</span><strong>{calendar.classification.official_entry.label}</strong></div>}
          </div>
        )}
        <label>
          指定
          <select aria-label="カレンダー指定" value={choice} disabled={props.disabled || loading || !calendar}
            onChange={(event) => setChoice(event.target.value as OverrideChoice)}>
            <option value="none">指定なし（基本判定）</option>
            <option value="holiday">指定休日</option>
            <option value="workday">営業日扱い</option>
          </select>
        </label>
        <label>
          理由（任意）
          <input aria-label="指定理由" type="text" maxLength={500} value={reason} disabled={props.disabled || loading || choice === "none"}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="effective-day-calendar-actions">
          <button type="button" disabled={props.disabled || loading || !calendar} onClick={save}>保存</button>
          {operation && <button type="button" className="secondary" disabled={props.disabled || loading}
            onClick={() => void execute(operation)}>保留中の指定を再試行</button>}
        </div>
      </div>
      {loading && !calendar && <p role="status">営業日カレンダーを読み込み中…</p>}
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {calendar && (
        <div className="effective-day-calendar-overrides" aria-label="現在の指定一覧">
          <h3>現在の指定</h3>
          {calendar.overrides.length === 0 ? <p className="muted">指定はありません。</p> : (
            <ul>
              {calendar.overrides.map((override) => (
                <li key={override.logical_date}>
                  <button type="button" className="secondary" disabled={props.disabled || loading}
                    onClick={() => { setSelectedDate(override.logical_date); void load(override.logical_date); }}>
                    {override.logical_date} · {kindLabel(override.override_kind)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
