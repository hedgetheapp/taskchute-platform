# D-111 — Android Notes Autosave Parity v0.4

Status: **Approved**

## Scope

D-111は、D-091のstandalone Document autosave semanticsとD-101のTask Primary Note
semanticsをnative Androidへ拡張する。D-110のうち、Android Notesをexplicit Save only、
standaloneの新規Noteをexplicit Saveまでmemory-only、dirty navigationを通常のdiscard確認
とする記述だけをsupersedeする。D-091 / D-101 / D-110の履歴とServer semanticsは変更しない。

対象はstandalone NoteとTask Primary Noteである。新規standalone Noteは`＋`押下時に既存の
canonical Createを一度実行し、serverが割り当てた`notitle`系のcanonical titleとDocument
identityをeditorへ採用する。既存Documentのtitle/bodyまたはTask Primary bodyは、最新入力から
約1秒のidle debounceでautosaveする。

## Safety and navigation

送信済みmutation requestはimmutableとし、保存中も入力を継続できる。保存成功時にlocal draftが
送信内容と異なる場合は、canonical revisionをbaselineへ採用して最新draftを追従保存する。
clean editorではgratuitous revisionを作らない。明示Saveはpending debounceをcancelして即時flush
するが、in-flight requestを二重送信しない。

Back、Today、Settings、logout等の通常遷移は、dirtyならflushし、保存中は遷移をdeferする。
成功してcanonical-cleanになった場合だけ遷移する。failure、revision conflict、
`infrastructure_ambiguous` / 401ではdraftとexact operation identityを保持し、危険な遷移を
行わない。明示的な`破棄して移動`は、in-flightまたは未確定requestがない安全な状態でのみ、
local draftを破棄して要求されたoriginへ遷移する。

## Boundary

Markdown sourceがcanonicalであり、draftはmemory-onlyである。local DB、localStorage、
offline queue、merge editor、new realtime protocol、Project/Routine Note entry point、
attachment、archive/delete UIは追加しない。Task Primary NoteはTask titleをread-only authority
として保持し、autosaveはbodyと既存のDocument revision/CASだけを更新する。

既存のD-104 auth handoff、D-106 session restore、D-108 realtime invalidation、D-020 operation
identity、D-090/D-091/D-101のowner isolation / retry / conflict semanticsを維持する。
Worker/API contract、APP/AUTH schema、migration、runtime dependency、productionは変更しない。
