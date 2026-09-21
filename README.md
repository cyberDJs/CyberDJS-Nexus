# CyberDJS Nexus

Shared CyberDJS project telemetry dashboard. The repository directory remains `ProjectCommandCenter`; the product/UI name is **CyberDJS Nexus**.

## Current slice

The dashboard scans real Eimy-local Git repositories at request time and combines them with validated cached collaborator snapshots. Source projects are strictly read-only. It observes branch, HEAD, working-tree state, normalized credential-free Git origin identity, recent activity, detected stack, tests and project-authority files.

It deliberately does **not** invent budget, progress, milestones, owners or delivery status when those facts are not present in a canonical project source.

An optional Nextcloud/WebDAV adapter is included for the future shared Eimy/Johny portfolio metadata flow. The adapter lives in this repository only; CyberCore is not modified or required.

## Boundaries

- Reads direct child Git repositories under the current macOS user's `~/0_DEV` by default; `PCC_PORTFOLIO_ROOT` can override the root explicitly.
- Excludes `SKILLS`, `VOODOO-SOURCES`, `VOODOO-SKILLSET` and this dashboard repository.
- Does not read secret values or environment files during normal dashboard operation.
- Does not modify scanned projects.
- No database, auth, deployment, commit, push or DNS change is included.
- WebDAV and Keychain access happen only when an operator explicitly runs a `webdav:*`, `portfolio:publish` or `portfolio:pull` command.
- Normal dashboard page loads read remote portfolio data only from the validated local cache; they never access Keychain or WebDAV.

## Run locally

```bash
npm install
npm run dev
```
Open `http://localhost:3000`. Refresh the page to collect a fresh local snapshot.

## Nextcloud / WebDAV adapter

Default target:

```text
https://cloud.cyberdjs.org/remote.php/dav/files/nulleimy/
```

The adapter reads the App Password from macOS Keychain only when invoked. The default Keychain lookup is:

```text
account: nulleimy
service: cybercore-nextcloud-webdav
```

The service name is only an existing Keychain label. It does not create a CyberCore dependency. Override it with `PCC_WEBDAV_KEYCHAIN_SERVICE` if the credential is renamed later.

Safe read-only connectivity check:

```bash
npm run webdav:check
```

Live round-trip verification:
```bash
npm run webdav:test
```

`webdav:test` first proves `/ChatGPT-Test` is absent. Only then it creates the folder, verifies it, deletes it and verifies deletion. If the folder already exists, the command aborts rather than deleting somebody else's data.

The adapter also supports metadata JSON transport:

```bash
node scripts/nextcloud-webdav.mjs put-json ProjectCommandCenter/eimy.json ./snapshot.json
node scripts/nextcloud-webdav.mjs get-json ProjectCommandCenter/eimy.json
```

Parent folders must already exist. Secret values are never written to the repository or printed by the adapter.

## Eimy portfolio publisher

The publisher converts the live local scan into a portable metadata snapshot and deliberately omits absolute local paths and commit subjects. The default remote target is:

```text
/ProjectCommandCenter/eimy-latest.json
```

Preview the exact payload locally without Keychain or network access:

```bash
npm run portfolio:snapshot
```

Publish and verify by reading the same JSON back from Nextcloud:

```bash
npm run portfolio:publish
```

The publisher creates `/ProjectCommandCenter` only if that collection is safely absent, then uploads `eimy-latest.json` and verifies the read-back content byte-for-meaning via parsed JSON. It publishes repository metadata only, never source files, environment files or credentials.

## Remote snapshot cache

The dashboard does not contact Nextcloud while rendering. Remote snapshots are pulled explicitly into an external runtime cache under:

```text
~/Library/Application Support/ProjectCommandCenter/remote/
```

Pull the verified Eimy snapshot from Nextcloud and atomically replace the local cache only after schema validation:

```bash
npm run portfolio:pull
```

The source registry already reserves `ProjectCommandCenter/johny-latest.json`, but no Johny portfolio data is fabricated or shown as real until that snapshot actually exists and is pulled. The dashboard reports each remote source as `Cached`, `Not synced`, or `Invalid cache`.

## Verification

```bash
npm run test:webdav
npm run test:portfolio
npm run test:remote
npm run test:shared
npm run typecheck
npm run lint
npm run build
```

The WebDAV, publisher and remote-cache tests use local mocks or temporary cache directories and do not access Keychain or Nextcloud. Live `webdav:*`, `portfolio:publish` and `portfolio:pull` commands are intentionally separate operator actions.

## Shared Eimy / Johny portfolio

The collector is parameterized by portfolio source. Eimy remains the default:

```bash
npm run portfolio:snapshot
npm run portfolio:publish
```

Johny's read-only collector profile is reserved for `/Users/horsedriver/0_DEV` and publishes to `ProjectCommandCenter/johny-latest.json` only after an explicit WebDAV identity is configured on Johny's machine:

```bash
npm run portfolio:snapshot:johny
```

`portfolio:publish:johny` deliberately refuses to reuse Eimy's WebDAV defaults. Johny must provide his own authorized `PCC_WEBDAV_BASE_URL`, `PCC_WEBDAV_USERNAME`, and `PCC_WEBDAV_KEYCHAIN_SERVICE`; credential values never belong in Slack, Git, evidence, or command output.

On Eimy's machine, once `johny-latest.json` exists in the authorized shared WebDAV location:

```bash
npm run portfolio:pull:johny
```

The dashboard derives the live local owner from the local portfolio root (`/Users/eimyna/0_DEV` → Eimy, `/Users/horsedriver/0_DEV` → Johny) and merges the other owner from a validated cached snapshot. `All / Eimy / Johny / Shared` filters operate on the unified identity model. Dedupe occurs only when both sides expose the same normalized Git `repositoryId`; same-name repositories without a remote identity are intentionally kept separate. Drift reports branch/HEAD divergence and local working-tree changes.

## Portable Johny collector

For a Mac that does not have this repository, use the standalone collector:

```text
scripts/cyberdjs-nexus-collector.mjs
```

It has no npm dependencies and uses only Node.js plus the local `git` executable. It scans only direct child Git repositories under `/Users/horsedriver/0_DEV`, never reads source-file contents, never writes into scanned repositories, never accesses Keychain or WebDAV, and never emits raw Git remote URLs.

Run it from a directory outside the scanned repositories:

```bash
node cyberdjs-nexus-collector.mjs \
  --root /Users/horsedriver/0_DEV \
  --owner Johny \
  --device MacBook-Pro-2 \
  --output ./johny-latest.json
```

The output is schema v1 compatible with CyberDJS Nexus. `repositoryId` is normalized from Git `origin` and strips protocol/userinfo so credentials are not emitted. The collector refuses to write its output inside any scanned source repository.
