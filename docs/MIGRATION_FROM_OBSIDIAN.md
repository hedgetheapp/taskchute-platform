# Migration from Obsidian TaskChute

Legacy repository: `https://github.com/hedgetheapp/taskchute-obsidian-mvp`

## Principle

legacy repositoryを捨てない。

新Platformが十分なcapabilityを持つまでは、現行利用、migration source、behavior reference、regression knowledgeとして保持する。

legacy repositoryは新Platformの仕様正本ではない。

## High-value reuse

優先して再利用する知見:

- `task_id` / `entry_id` separation
- multiple Entries per Task
- Routine occurrence identity
- Sections / ordering
- execution lifecycle
- interrupt continuation lessons
- offline / retry / Ack ambiguity lessons
- mobile convergence lessons
- TEST_MATRIX / focused regression scenarios
- existing Vault data

## Do not wholesale-port

以下を新Platform coreへそのまま持ち込まない。

- monolithic `main.js`
- Obsidian DOM UI
- Vault-as-platform-authority assumption
- `data.json`-centric runtime / outbox architecture
- localStorage UI mechanisms
- physical Markdown mutationをPlatform domain authorityとする設計

旧資産を利用する場合は、必要に応じて`Referenced` / `Adapted` / `Ported`を区別する。

## Future importer

以下は現時点のProposed migration flowであり、exact contractは未決。

1. dry-run
2. parse
3. identity validation
4. collision report
5. preview
6. import
7. post-import verification

既存IDは、安全かつ意味が保たれる場合にpreserveする方向とする。

どのTask / Entry / Routine identity、log / historyを移行対象とするかはOpen Questionとして別途決定する。
