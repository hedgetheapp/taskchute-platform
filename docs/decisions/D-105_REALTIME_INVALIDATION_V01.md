# D-105 — Realtime Invalidation v0.1

Status: **Approved**

Date: 2026-09-14

## Decision

TaskChute Webは、canonicalなHTTP Queryを補完するfreshness acceleratorとして、Cloudflare Durable ObjectsのHibernation WebSocket APIを使ったinvalidate-only realtime notificationを導入する。Realtime notificationはfreshness acceleratorであり、canonical authorityではない。

v0.1では、認証済みTaskChute app userごとに論理的に1つの`RealtimeHub` Durable Objectを持ち、同じuserのbrowser tab接続へversioned invalidationをbroadcastする。Workerは通常のsessionからserver-sideでapp user identityを解決し、client提供のuser IDをrouting authorityにしない。

## Scope and boundary

対象surfaceはToday / selected Day、Project、Mode、Routine、Notes / Documentsである。D1と既存HTTP Queryが唯一のcanonical data authorityであり、WebSocketでTask、Entry、Project、Mode、Routine、Document body、auth data等のcanonical objectを配信しない。受信clientは該当surfaceを既存Queryで再fetchする。

Realtime endpointはauthenticated same-origin WebSocket upgradeだけを受け付け、Originをcurrent application originと照合する。通常HTTP、未認証request、wrong-origin upgradeは安全に拒否する。browserからのWebSocket messageはdomain commandとして扱わず、channelはinvalidate-onlyとする。

通知protocolはversionedで、v1の`invalidate` messageにday、projects、modes、routines、documents scopeを含める。messageとscopeはサイズ・形状を検証し、Markdown本文、credentials、session情報、revisionを含めない。

## Publish and consistency

Mutationのcanonical D1 commitが成功した後にだけbest-effort publishを行う。publishはD1 atomic transactionの外側であり、publish failureは既にcommitされたmutationをfailureまたは`infrastructure_ambiguous`へ変換しない。deterministic rejection、auth failure、known-not-committed outcomeではpublishしない。ambiguous operationはcanonical reconciliationを先に行い、misleading invalidationを発行しない。

各mutation familyからrealtime scopeへの写像はWorkerの一つのdiscoverable mappingで管理する。origin tabを特別扱いしてcorrectnessを得ることはせず、同一tabへのredundant refreshはsafeな場合だけcoalesceする。

## Web client behavior

signed-in tabごとに1つのconnection managerを起動し、signed-outではcloseする。接続失敗はauth failureと混同せず、bounded exponential backoffとjitterでreconnectする。401 handshake/probeだけを既存D-104 `reauth-required`へ接続し、dirty/pending/unresolved Note、D-066 mutation、floating Note window stateを破棄しない。

初回接続成功、reconnect、visibility復帰、online復帰では必要なmounted surfaceをcanonical refetchする。受信invalidationとlocal dirty draft、pending mutation、retained ambiguous operationが競合する場合はrefreshを延期またはstaleとして保持し、local stateをsilent overwriteしない。cleanなDocumentだけは対象Documentをrefetchし、dirty/saving/unresolved Documentは既存CAS/conflict/reconcile境界を使う。

Realtime failureは通常HTTP利用を妨げない。periodic polling、offline sync、collaborative merge、multi-tab canonical coordinationは追加しない。

## Infrastructure and cost boundary

`RealtimeHub`はHibernation WebSocket APIを使い、domain stateをDurable Object storageへ保存せず、timer/intervalでhibernationを妨げない。新しいDurable Object namespaceはSQLite-backed configurationで定義し、local/nonprod/productionのconfig parityを保つが、このDecisionでproductionへdeployしない。APP/AUTH D1 schema、migration、external dependency、paid-plan upgradeは追加しない。

Cloudflare platformのHibernation WebSocket、SQLite-backed Durable Object namespace、Wrangler configuration、pricing/quotaは実装・resource作成・production判断時に公式資料を再確認する。Product behaviorへpricingをhard-codeしない。

## Non-goals

- WebSocketをcanonical data transportまたはmutation transportにすること
- Android offline synchronizationを決定すること
- periodic polling、offline queue、service worker、multi-tab conflict resolution
- realtime command、Task/Project/RoutineOccurrence Note、attachments、production rollout

Official references:

- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
