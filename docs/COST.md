# Cost

ChatGPT/Codex development-AI costs are excluded from this document.

## Working constraint

Initial product is single-user. Development and personal operation should stay within infrastructure free tiers whenever practical.

## Principles

- Do not require always-on VMs initially.
- Do not add multi-tenant infrastructure that a single user does not need.
- Do not store unlimited binary images directly in relational DB tables.
- Use Android local cache/delta sync to avoid unnecessary reads.
- Record cost impact before adding a paid service.

## Current candidates

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2

These are candidates, not yet final provider decisions. Recheck current pricing when adopting them.

## Image-cost consideration

Notes and Comments are expected to support images, so compression, resize, cleanup, and object storage must be designed from the start.
