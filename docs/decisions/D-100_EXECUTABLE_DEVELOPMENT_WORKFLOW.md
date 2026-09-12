# D-100 — Executable Development Workflow / Codex Cycle Acceleration

Status: **Approved / implemented**

## Decision

既存のFAST / STANDARD / HEAVY verification profileと、impact analysisに基づくprofile escalationを正本として維持する。その共通automated coreだけを、`apps/web`のNode標準機能による実行補助へ載せる。

- `npm run preflight`はauthoritativeなGit / remote snapshotを作り、dirty state、ahead / behind、変更path、review / escalation候補のrisk signalを表示する。fetchできない場合はstale stateをauthoritativeとして表示せず失敗する。`--offline`は明示的な非authoritative inspectionに限る。
- `npm run verify:fast` / `verify:standard` / `verify:heavy`は、明示された`--surface web|worker|cross|migrations|docs`のplanだけを実行する。surfaceをfile名から自動推測しない。
- `--nonprod-static`はexact nonprod build、既存deploy guard、Wrangler `--dry-run`だけを追加する。実deploy、DB write、credential変更、restore、production操作は行わない。
- 実行artifactにはHEAD、profile、surface、各stepのstart / end / duration / statusを一時的に記録する。`npm run evidence:summary`はそれを現在のGit stateと合わせるが、未実施のbrowser / persistent nonprod / API / DB evidenceをPASSへ昇格せず、canonical docsも自動編集しない。
- profileはpolicyの代替ではなく実行helperである。HEAVY固有のmigration / recovery、persistent nonprod、API、browser、DB evidenceは別途必要になり得る。

これはdevelopment operationのDecisionであり、Product / Domain / Web runtime / Worker API / schema / migration / auth / dependency / production policyを変更しない。

## Optimization target

最初の測定対象は、通常30–60分かかるdevelopment cycleを20–40分へ短縮することである。D-100後の3–5 work itemで実測timingを蓄積し、その結果を次の最適化判断へ使う。15–25分は後続のtargetであり、直ちにverification qualityとのtrade-offを行う目標ではない。

## Canonical boundary

`docs/VERIFICATION_PROFILES.md`、`docs/DEVELOPMENT_WORKFLOW.md`、`docs/TEST_MATRIX.md`、および各work itemのevidenceがverificationのauthorityである。D-100のtoolchainが出すPASSはcommon automated coreのPASSだけを意味し、Implemented / Integrated / Tested / Verified / Releasedを同一視しない。
