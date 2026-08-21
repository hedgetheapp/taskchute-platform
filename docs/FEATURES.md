# Features

この文書のStatusはFeature development statusを示す。

Verificationの正本は`docs/TEST_MATRIX.md`であり、`Implemented`等のFeature statusだけを理由に`Verified`と判断しない。

Status values: Planned / In design / Implemented / Verified

| Feature | Status | Notes |
|---|---|---|
| Server canonical task state | In design | Target direction Approved |
| Task / Entry identity | In design | 分離自体はApproved。exact model / ID formatは設計中 |
| Project | In design | Proposed First vertical slice candidate |
| Today board / ordering | In design | Proposed First vertical slice candidate |
| Start / Complete lifecycle | In design | retry safetyはApproved。詳細lifecycleは設計中 |
| Web app | In design | primary / universal client。initial development priority最優先 |
| Web browser reload recovery | In design | Proposed First vertical slice candidate |
| Android app | Planned | native first-class client |
| Android offline capability | In design | capability自体はApproved。操作範囲 / sync方式は未決 |
| Android Widget | Planned | Android architectureを再利用 |
| Wear OS / Pixel Watch | Planned | companion client target。exact scopeは未決 |
| iOS native app | Planned | Future / low priority。まずWeb clientから利用 |
| Notes/Documents | In design | Markdown-native |
| Project note | Planned | Web / Androidでread/editをtarget |
| Task note | Planned | Web / Androidでread/editをtarget |
| Markdown comments | Planned | images対応を含む |
| Image attachments | In design | shared Attachment capability |
| Routine | Planned | legacy semanticsを後続設計で再利用 |
| Obsidian integration | Planned | optional client |
| Legacy Vault importer | Planned | exact migration contractは未決 |
