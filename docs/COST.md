# Cost

ChatGPT / Codex等のdevelopment-AI costはこの文書の対象外とする。

## Working constraint

初期Productはsingle-userを前提とする。

developmentおよびpersonal operationでは、実用上可能な範囲でinfrastructure free tierを優先する。

Costだけを理由にProduct / Domain / Security requirementを曲げない。

## Principles

- 初期段階でalways-on VMを必須としない。
- single-userに不要なmulti-tenant infrastructureを先行導入しない。
- paid serviceを追加する前に継続Costとfree-tier / quota影響を記録する。
- Androidのoffline-capable requirementを満たしつつ、不要なnetwork read / transferを抑える方向で設計する。具体的なsync方式は未決。
- binary image/fileをrelational DBへ直接保持する案を採る場合は、storage / transfer / operation costと制約を明示的に評価する。
- external service / pricing / quotaは変更され得るため、Material Decisionやproduction deployment前にcurrent情報を再確認する。

## Approved initial infrastructure

D-020により、initial Server + Web implementationでは以下を採用する。

- Cloudflare Workers: Server API runtime
- Cloudflare D1: structured application persistence

AuthはD-021によりBetter AuthをWorkers + D1上で利用する方向とする。初期構成ではTaskChute Domain persistenceとauth-managed persistenceの責務を分離する。

この採用は、現時点のsingle-user scope、small vertical slice、managed infrastructure、relational query requirement、運用複雑性を総合して決定したものであり、free tierだけを理由にしたDecisionではない。

production deployment前には、Workers / D1のcurrent pricing、quota、storage limit、request limit、platform restrictionを再確認する。

## Initial production posture

D-049によりinitial productionもWorkers Freeから開始する。2026-09-01確認時点のplanning boundaryはWorkers 100,000 requests/day、D1 5 million rows read/day、100,000 rows written/day、total storage 5 GB、Free Time Travel retention 7日である。actual Cloudflare stateをresource作成前に再確認し、limit不足時にpaid planへ自動upgradeしない。

Initial productionはWorker 1つとseparate AUTH / APP D1 2つを追加する。custom domain、Cloudflare Access、paid plan、external backup service、DR automationは今回のapproved cost scopeに含めない。

## Deferred / optional infrastructure

以下はinitial implementationでは採用しない。

- Durable Objects
- external PostgreSQL / Hyperdrive
- D1 read replication
- realtime push infrastructure

将来requirementやD1 feasibility evidenceによって必要性が生じた場合に再評価する。

特にD1 atomicity / concurrency spikeが成立しない場合は、Costだけを理由にD1へ固執せずDurable Objects等を含めて再評価する。

## Binary storage

Cloudflare R2等のobject storageはcandidateであり、final Decisionではない。

D-008のstructured data / Markdown / attachment metadataとbinary storageを分離する方向は`Proposed`のままとする。

## Image-cost consideration

Notes / Commentsはimagesを扱うため、compression、resize、cleanup、storage方式を初期Architecture設計からcost観点で評価する必要がある。

Location / Map等で外部providerを採用する場合も、API usage、privacy、quota、ongoing costをMaterial Decision前に評価する。
