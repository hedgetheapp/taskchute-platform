# D-122 — Android Nonprod APK Stable Signing / Updateability v0.1

Status: **Approved**

Date: 2026-09-19

## Decision

Android debug APKs intended for persistent nonprod verification and Galaxy S23 testing use one dedicated stable nonprod signing identity. The key alias is `taskchute-nonprod`. The keystore is created outside the repository, the private material is stored only in GitHub Actions Secrets and approved local secure storage, and no signing value is logged or committed.

GitHub Actions uses the repository history count as the monotonic Android `versionCode` and passes it explicitly to Gradle. The Android Gradle configuration accepts the `taskchute.versionCode` property and the three environment variables `TASKCHUTE_ANDROID_SIGNING_STORE_FILE`, `TASKCHUTE_ANDROID_SIGNING_STORE_PASSWORD`, and `TASKCHUTE_ANDROID_SIGNING_KEY_PASSWORD`. The three variables are an all-or-none contract; a normal local build without them continues to use the standard debug signing behavior.

The nonprod CI job reconstructs the keystore only under the runner temporary directory, builds the canonical nonprod URL APK, compiles the instrumentation APK, verifies the APK certificate against the reconstructed keystore, uploads the debug APK, and removes the temporary keystore in an always-run cleanup step. Production signing and production operations are outside this Decision.

## Compatibility boundary

The first D-122-signed APK cannot update an APK installed with the previous debug signing identity. A one-time uninstall/reinstall is required when switching an emulator or Galaxy S23 from the old identity. Subsequent D-122 APKs with the same alias/key update in place when their `versionCode` increases. Android package identity, UI behavior, API contracts, persistence, and domain semantics are unchanged.

## Scope and non-goals

This Decision covers only nonprod Android APK signing, CI artifact generation, version monotonicity, certificate verification, and updateability evidence. It does not add a runtime dependency, Worker/API change, schema or migration, offline authority, production signing/rollout, release, branch, PR, tag, or new user-visible behavior.

Required evidence distinguishes local default build, signing-enabled build, signer fingerprint, version code, AVD update install, marker preservation where `run-as` permits it, exact-SHA CI artifact/signature, Galaxy S23 updateability, and production/release status.