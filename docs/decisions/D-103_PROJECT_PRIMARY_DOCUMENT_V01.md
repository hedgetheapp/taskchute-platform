# D-103 — Project Primary Document v0.1

Status: **Approved**

## Scope

Project Primary Documentは、既存のshared Markdown-native `Document` foundationをProjectへ接続する。Projectごとに論理的に1つ、物理的には最初の明示的なopen時に0..1の`project_primary` Documentをlazy materializeする。RoutineOccurrence Document、attachments、backlinks、search、preview、rich text、Project Note独自titleは含めない。

## Document authority

Project Primary Documentはowner-scopedなProject relationを持ち、Projectと同じapp userに属する。DocumentのMarkdown body、revision、timestampsを保持するが、`documents.title`は`NULL`とし、表示titleは常にcurrent Project titleをauthorityとする。Project renameはbodyやDocument revisionを変更せず、開いているProject Noteの表示titleへ反映する。

Project archiveはrelationとDocumentを保持し、archived ProjectからもNoteをopenできる。Project hard deleteは既存のTask unassignment、Project board/archive state、historical snapshot/history preservationを維持しながら、guarded atomicな`DeleteProject` operation内で`project_primary_documents` relationとlinked `project_primary` Documentを永久削除する。Project Noteがopen中の場合はdirty / in-flight / unresolved saveを先に安全なbarrierで解決し、delete確認後にwindowを閉じる。deleteがambiguousな間はwindowを閉じない。

## API and retry safety

`EnsureProjectPrimaryDocument`はclient-generated Document identityを受け取り、Projectごとの既存relationを再利用する。`UpdateProjectPrimaryDocument`はProject/Document relationとexpected revisionをowner-scopedに検証し、Markdown bodyだけをCAS更新する。両者は既存のoperation identity、exact replay、misuse rejection、revision conflict、ambiguity、transaction assertion conventionsを利用する。Document permalink `/?view=note&document=<document-id>`とowner-scoped resolverは`project_primary`を解決し、current Project titleを返す。Project Primary DocumentはNotes pageのProject Note listにのみ物理materialized行として現れる。

## Web behavior

Task rowのProject cell、Settings > Project Boardのactive / archived Project row、Notes pageからProject Noteをopenできる。Notes pageは`すべて` / `通常ノート` / `プロジェクトノート`のdropdownでfilterする。Task Primary Noteはこのlistへ追加しない。Task Primary NoteとToday / Project Board / direct routeから開くProject Primary NoteはD-102のshared floating-window registry、one-document-per-tab dedupe、48px cascade、minimize/maximize、geometry、route、dirty / unresolved / flush / unload barrier、Markdown autosave/CASを共有する。Notes pageでProject Noteを選択した場合は同じNotes editor内でbodyだけをinline編集し、同一Projectのfloating windowが既に存在する場合はそのwindowをactivate / restoreしてinline editorを二重にmountしない。Project Primaryはtabごとに最大1つのeditable writerを持つ。

## Persistence

APP `0032_project_primary_documents.sql`は`documents.kind`へ`project_primary`を追加し、owner-scoped Project/Document relationと必要なoperation allow-listを追加する。既存standalone / task_primary Document、relation、operation、Project/Task/Entry/Execution/historyは保持し、AUTH migration、dependency、production operation、future document typesは追加しない。

Canonical implementation and verification evidence is recorded in `docs/CURRENT.md` and `docs/TEST_MATRIX.md`. Released remains **NO** and production remains **NOT_RUN**.
