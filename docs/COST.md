# Cost

ChatGPT / Codex等のdevelopment-AI costはこの文書の対象外とする。

## Working constraint

初期Productはsingle-userを前提とする。

developmentおよびpersonal operationでは、実用上可能な範囲でinfrastructure free tierを優先する。

これは現時点のWorking constraintであり、特定providerやarchitectureを自動的にApprovedするものではない。

## Principles

- 初期段階でalways-on VMを必須としない。
- single-userに不要なmulti-tenant infrastructureを先行導入しない。
- paid serviceを追加する前に継続Costとfree-tier / quota影響を記録する。
- Androidのoffline-capable requirementを満たしつつ、不要なnetwork read / transferを抑える方向で設計する。具体的なsync方式は未決。
- binary image/fileをrelational DBへ直接保持する案を採る場合は、storage / transfer / operation costと制約を明示的に評価する。

## Current candidates

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2

これらはcandidateであり、final provider Decisionではない。

採用判断時にはcurrent pricing、quota、platform restrictionを再確認する。

## Image-cost consideration

Notes / Commentsはimagesを扱うため、compression、resize、cleanup、storage方式を初期Architecture設計からcost観点で評価する必要がある。

D-008のstructured dataとbinary storageの分離はleading directionだが`Proposed`であり、object storage採用をこの文書から確定しない。
