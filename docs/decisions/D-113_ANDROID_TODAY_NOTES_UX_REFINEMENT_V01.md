# D-113 — Android Today / Notes UX Refinement v0.1

Status: **Approved**

## Decision

D-113 refines the approved Android D-109–D-112 surfaces without introducing new
Product or Domain semantics.

Today keeps the existing canonical Day projection and commands while refining:

- a consistent leading slot with a smaller visual selection control;
- icon-led planned-start / estimate metadata;
- available execution start/end facts without fabricating missing timestamps;
- high-opening Add/Edit sheets;
- restrained lifted drag and insertion feedback;
- local, default-expanded Section collapse/expand state.

Native Notes keeps D-090/D-091/D-101/D-110/D-111 Document, autosave, CAS, and
memory-only draft semantics while refining:

- no visible manual Save button (autosave remains canonical for Android);
- borderless Markdown source editing;
- footer `ノート` return to the Notes list through the existing safe flush path;
- standalone Note archive / restore / hard-delete UI through the approved D-092
  owner-scoped lifecycle commands and exact operation/revision rules.

Task Primary Note and Project/Routine Note boundaries remain unchanged.

## Boundary

No Worker/API semantic change, APP/AUTH migration, schema change, dependency,
realtime protocol change, production operation, or new persistence path is part
of D-113. Existing server projections remain authoritative. When execution end
data is absent, Android displays only the facts actually present.

## Evidence boundary

The D-109 Galaxy S23 corrective smoke remains historical `PASS / USER_CONFIRMED`.
D-113 local Android JVM and Windows `TaskChute_API33` evidence are recorded in
`docs/CURRENT.md` and `docs/TEST_MATRIX.md`. Fresh D-113 Galaxy S23 smoke remains
`PENDING_SMOKE` until the Product Owner tests the fresh final-main APK.
