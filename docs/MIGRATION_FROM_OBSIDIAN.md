# Migration from Obsidian TaskChute

Legacy repository: `https://github.com/hedgetheapp/taskchute-obsidian-mvp`

## Principle

Do not discard the legacy repository. Keep it usable until the new platform is sufficiently capable.

## High-value reuse

- task_id / entry_id separation
- multiple entries per Task
- Routine occurrence identity
- Sections / ordering
- execution lifecycle
- interrupt continuation lessons
- offline / retry / Ack ambiguity lessons
- mobile convergence lessons
- TEST_MATRIX / focused regression scenarios
- existing Vault data

## Do not wholesale-port

- monolithic `main.js`
- Obsidian DOM UI
- Vault-as-platform-authority assumption
- `data.json`-centric runtime/outbox architecture
- localStorage UI mechanisms
- physical Markdown mutation as platform domain authority

## Future importer

1. dry-run
2. parse
3. identity validation
4. collision report
5. preview
6. import
7. post-import verification

Preserve existing IDs where safe and meaningful. Exact migration contract remains open.
