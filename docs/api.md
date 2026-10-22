# Elera Supervisor API Checklist

The supervisor API is the control plane for `elera-lib`, `elera-cli`, GitOps,
and recovery. HAProxy must proxy supervisor HTTP only. The supervisor makes
health, topology, eligibility, routing, and credential decisions. `elera-lib`
uses the returned routing bundle to maintain direct SQL connections.

`ROOT_TOKEN` is reserved for first boot, bootstrap, metadata initialization,
full restore, and token administration. Usual clients use scoped bearer
tokens. The replicated `elera_meta` database is authoritative for managed
databases, identities, accounts, grants, tokens, and encrypted artifact
metadata. The age private key is not stored in MariaDB.

This checklist describes the current supervisor API surface. A checked item
means the endpoint exists and is covered by the repository's validation. It
does not imply production Kubernetes readiness. Unchecked items are planned
work and must not be treated as available API behavior.

## GitOps supervisor configuration

GitOps owns the supervisor's needed configuration, not hand-authored
MariaDB/Elera files. Kubernetes must provide a supervisor ConfigMap for
non-secret intent and a separate Secret for tokens, passwords, TLS material,
and other sensitive inputs. The supervisor validates that intent and renders
the standardized MariaDB and Elera configuration files locally.

- [x] `GET /api/v1/config/intent` — inspect the validated non-secret supervisor intent and needed hash.
- [x] `POST /api/v1/config/plan` — classify changes as no-op, reload, start again, or unsafe.
- [x] `POST /api/v1/config/apply` — atomically create and apply a confirmed configuration.
- [x] `POST /api/v1/config/verify` — compare the active rendered intent with the needed intent.
- [ ] `POST /api/v1/config/rollback` — restore the last known-good rendered configuration (deferred after MVP).

The MVP tracks needed and active hashes. A retained last-known-good file is
used for recovery before a dedicated rollback endpoint is added. It writes
files atomically, validates generated configuration before activation, and
only reloads MariaDB for dynamic changes. Listener,
provider, cluster identity, or node identity changes require a controlled
start again. Unsafe bootstrap changes require explicit confirmation.

## Public probes

- [x] `GET /healthz` — process liveness. Always returns `200` while serving.
- [x] `GET /readyz` — local supervisor and MariaDB readiness. Returns `503` until available.

## Status and diagnostics

- [x] `GET /api/v1/status` — redacted local process and database status.
- [ ] `GET /api/v1/version` — supervisor, MariaDB, and provider versions.
- [x] `GET /api/v1/config` — active non-secret configuration.
- [ ] `GET /api/v1/diagnostics` — redacted support and automation snapshot.
- [ ] `GET /api/v1/metrics` — optional Prometheus metrics.

## Supervisor synchronization

- [x] `GET /api/v1/cluster/status` — local and currently observed cluster state.
- [ ] `GET /api/v1/cluster/writer-assignments` — current per-application writer assignments.
- [x] `GET /api/v1/cluster/topology` — current observations and quorum decision.
- [x] `GET /api/v1/cluster/observations` — inspect authenticated cluster observations. Requires `cluster:read`.
- [x] `GET /api/v1/cluster/quorum` — inspect the authenticated cluster quorum. Requires `cluster:read`.
- [x] `POST /api/v1/cluster/observations` — publish an authenticated peer observation.

Observations must expire. A stale observation cannot keep a node eligible.

## First boot and metadata

- [x] `GET /api/v1/initialization` — inspect data-directory initialization state.
- [x] `POST /api/v1/initialization/plan` — preview first-boot changes.
- [x] `POST /api/v1/initialization/apply` — apply basic database/user/grant setup.
- [x] `POST /api/v1/initialization/verify` — verify current basic initialization.
- [ ] `POST /api/v1/initialization/rotate-credentials` — change bootstrap credentials.
- [x] `GET /api/v1/metadata/status` — inspect `elera_meta` schema readiness.
- [x] `POST /api/v1/metadata/initialize` — create the canonical metadata schema idempotently. Requires `confirm: true`.
- [x] `POST /api/v1/metadata/verify` — verify metadata integrity and replication state.
- [x] `GET /api/v1/cluster/observations` — inspect new peer observations.
- [x] `POST /api/v1/cluster/observations` — send an authenticated observation.
- [x] `GET /api/v1/cluster/quorum` — examine the current new observation quorum.
- [x] `POST /api/v1/cluster/lifecycle/plan` — plan a bootstrap, join, keep, or recovery operation.
- [x] `POST /api/v1/cluster/lifecycle/apply` — execute an injected lifecycle operation with confirmation.

## Elera lifecycle

- [x] `GET /api/v1/cluster/bootstrap/eligibility` — state bootstrap safety.
- [x] `POST /api/v1/cluster/bootstrap/plan` — preview bootstrap checks.
- [x] `POST /api/v1/cluster/bootstrap` — explicitly create a Primary component.
- [x] `POST /api/v1/cluster/join/plan` — preview a planned cluster join.
- [x] `POST /api/v1/cluster/join` — join a configured cluster.
- [x] `POST /api/v1/cluster/leave` — gracefully keep the cluster.
- [x] `POST /api/v1/cluster/recover/plan` — analyze total-cluster-loss recovery.
- [x] `POST /api/v1/cluster/recover` — execute confirmed recovery.
- [x] `GET /api/v1/cluster/wait-ready` — wait for local readiness.

## Connection bundles

- [x] `POST /api/v1/credentials/lease` — issue credentials and eligible direct SQL routes.
- [x] `POST /api/v1/credentials/refresh` — refresh an existing credential lease.
- [ ] `POST /api/v1/credentials/revoke` — revoke a credential lease.
- [x] `GET /api/v1/routes` — return ordered application writer and reader candidates.
- [x] `POST /api/v1/routes/refresh` — explicitly recalculate a routing bundle.
- [x] `GET /api/v1/routing/bundle` — return the complete credential and routing snapshot.
- [x] `GET /api/v1/routing/stream` — upgrade to the authenticated routing WebSocket.
- [x] `POST /api/v1/routing/resync` — return a current snapshot after reconnect.
- [x] `GET /api/v1/routing/validate` — validate the authenticated application's current bundle and eligible route set.
- [x] `GET /api/v1/routing/events` — inspect the latest in-memory routing event for an application.
- [x] `POST /api/v1/routing/rebalance` — explicitly invalidate and recalculate one application's assignment. Requires `routing:rebalance` and `confirm: true`.

Bundles contain the database, identity, credentials, machine FQDNs, and port `3306`.
They also include ordered writer and reader candidates, weights, a version, refresh time, and expiry.
The supervisor quorum assigns one logical writer to each application.
`elera-lib` sends writes to that writer and may use permitted readers for reads.
The WebSocket transmits routing changes, drain and recovery events, credential notices, and heartbeats.

It excludes SQL. HTTP API refresh remains the fallback when the stream is down.

The stream is the preferred low-latency path.
Supervisors examine health and load about once each second.
They publish state changes without slow client polling.

The supervisor does not proxy SQL traffic and does not expose the former
`33060` or `33070` agent-check listeners. HAProxy is expected to proxy these
HTTP endpoints, with WebSocket upgrades. Applications connect directly
to the MariaDB addresses returned in the bundle.

## Scoped tokens

- [ ] `GET /api/v1/tokens` — list redacted token metadata.
- [x] `POST /api/v1/tokens` — create a scoped bearer token.
- [ ] `GET /api/v1/tokens/{name}` — inspect token metadata and bindings.
- [ ] `POST /api/v1/tokens/{name}/rotate` — change token material.
- [x] `POST /api/v1/tokens/revoke` — revoke a token.
- [ ] `POST /api/v1/tokens/{name}/bindings` — add resource and scope bindings.
- [ ] `DELETE /api/v1/tokens/{name}/bindings/{binding}` — remove a token binding.

## Managed identities

- [x] `GET /api/v1/identities` — list managed database identities.
- [x] `POST /api/v1/identities` — add and provision an identity.
- [ ] `GET /api/v1/identities/{name}` — inspect identity metadata and scopes.
- [ ] `PATCH /api/v1/identities/{name}` — update identity metadata.
- [x] `POST /api/v1/identities/rotate` — change the identity credential.
- [x] `POST /api/v1/identities/revoke` — revoke the identity.

## Databases

- [x] `GET /api/v1/databases` — list managed application databases.
- [ ] `GET /api/v1/databases/{name}` — inspect database metadata.
- [ ] `POST /api/v1/databases/plan` — preview database changes.
- [ ] `POST /api/v1/databases/apply` — create or reconcile databases.
- [ ] `POST /api/v1/databases/verify` — verify needed database state.
- [ ] `DELETE /api/v1/databases/{name}` — explicitly remove a managed database.

## Accounts and grants

- [x] `GET /api/v1/accounts` — list accounts without passwords.
- [ ] `GET /api/v1/accounts/{name}` — inspect managed account metadata.
- [x] `POST /api/v1/accounts/provision` — provision an account and generated credential.
- [ ] `POST /api/v1/accounts/plan` — preview account changes.
- [ ] `POST /api/v1/accounts/{name}/rotate` — change an account password.
- [x] `POST /api/v1/accounts/revoke` — revoke an account.
- [ ] `GET /api/v1/accounts/{name}/grants` — list structured grants.
- [ ] `PUT /api/v1/accounts/{name}/grants` — reconcile structured grants.
- [x] `POST /api/v1/accounts/verify` — verify account and grants.
- [x] `POST /api/v1/accounts/export` — export logical account SQL.
- [ ] `POST /api/v1/accounts/import/plan` — preview logical account restoration.
- [x] `POST /api/v1/accounts/import` — import logical accounts and grants.

Usual provisioning uses structured grant objects. Raw grant SQL is accepted
only by the explicit recovery-import operation.

## Encrypted artifacts

- [x] `GET /api/v1/secrets` — list encrypted artifact metadata (`backup:read`).
- [x] `GET /api/v1/secrets/{name}` — retrieve age-encrypted ciphertext (`backup:read`).
- [x] `PUT /api/v1/secrets/{name}` — create or replace age-encrypted ciphertext (`backup:create`).
- [x] `DELETE /api/v1/secrets/{name}` — delete an encrypted artifact (`backup:restore`).
- [x] `POST /api/v1/secrets/{name}/verify` — verify checksum and key metadata (`backup:read`).

The supervisor stores only age ciphertext and non-secret metadata in
`elera_meta`. GitOps Secrets/operator-managed inputs remain the initial home
for SSH keys, `known_hosts`, TLS files, and backup configuration. The supervisor
does not decrypt artifacts or return plaintext. The CLI/library decrypts locally
and materializes data only for a bounded operation with deterministic cleanup.

Backup sidecars contain logical account/grant definitions and age-encrypted
artifact records. Passwords, password hashes, age identities, and private key
material are not exported in plaintext. Ciphertext records are restored through
the authenticated artifact API and decrypted only by the local operator.

## Reconciliation

- [x] `POST /api/v1/reconcile/plan` — compare needed managed databases and identities with MariaDB.
- [x] `POST /api/v1/reconcile/apply` — apply confirmed managed database and identity additions.
- [x] `POST /api/v1/reconcile/verify` — report metadata change without changing state.

## Backup and restore coordination

- [x] `GET /api/v1/metadata/export` — export logical managed metadata for a backup sidecar. Do not export passwords or private keys.

- [ ] `POST /api/v1/backups/plan` — preview backup eligibility and metadata.
- [ ] `POST /api/v1/backups/create` — align backup metadata.
- [ ] `POST /api/v1/backups/{id}/verify` — verify backup metadata and artifact.
- [x] `POST /api/v1/restores/metadata/plan` — plan metadata restoration.
- [x] `POST /api/v1/restores/metadata/apply` — restore `elera_meta` metadata.
- [x] `POST /api/v1/restores/accounts/plan` — plan account restoration.
- [x] `POST /api/v1/restores/accounts/apply` — recreate accounts and grants.
- [x] `POST /api/v1/restores/accounts/verify` — verify account restoration.
- [ ] `POST /api/v1/restores/plan` — plan application data restoration.
- [ ] `POST /api/v1/restores/apply` — align application restoration.

Recovery order is metadata, encrypted artifacts, databases, accounts, grants,
connectivity verification, application schemas/data, and application
verification. `elera-cli` continues to stream dumps through native
`mariadb-dump` and `mariadb` processes. Dump contents do not pass through JSON.

## Maintenance

- [x] `GET /api/v1/traffic/status` — inspect local eligibility and drain state.
- [x] `POST /api/v1/traffic/drain` — stop issuing local routes.
- [x] `POST /api/v1/traffic/undrain` — continue issuing local routes.
- [x] `GET /api/v1/recovery/status` — inspect the current cold-recovery decision state.
- [x] `GET /api/v1/cluster/cold-recovery/evidence` — inspect new quorum data.
- [x] `GET /api/v1/cluster/cold-recovery/status` — inspect the persisted recovery epoch.
- [x] `POST /api/v1/cluster/cold-recovery/plan` — calculate a deterministic candidate.
- [x] `POST /api/v1/cluster/cold-recovery/retry` — discard a blocked decision and recollect data.
- [x] `POST /api/v1/cluster/cold-recovery/authorize` — authorize the exact epoch with quorum.
- [x] `POST /api/v1/cluster/cold-recovery/bootstrap` — mark the approved winner as bootstrapping.
- [x] `POST /api/v1/cluster/cold-recovery/complete` — publish verified bootstrap end.
- [x] `GET /api/v1/recovery/events` — inspect recent recovery decisions.
- [x] `POST /api/v1/recovery/acknowledge` — record an operator acknowledgement without granting bootstrap authority. Requires `recovery:acknowledge` and `confirm: true`.
- [x] `POST /api/v1/recovery/abort` — abort recovery and mark the cluster unavailable. Requires `recovery:abort` and `confirm: true`.
- [x] `POST /api/v1/node/data/reset` — root-only, exact-node guarded dry-run or restore.
      Requests require `node` and `confirmation: "RESET <node>"`.

      The supervisor resolves its configured local data directory.
      An optional client `dataDir` must match that path.
      Execution also requires an idempotency key.

      Initialized data requires `force: true` and `recoveryDisposition: "reset-initialized-data"`.
      Use `recoveryDisposition: "single-member-resync"` only with fencing, routing exclusion, and one healthy Primary donor.

      Execution stops MariaDB and removes only the configured data directory.
      It starts MariaDB without bootstrap and waits for Synced/Primary readiness.
      Then it re-adds the node to route selection.
      The pending/recovery listener keeps this endpoint available while SQL is unavailable.
      Offline resync also requires `offline: true` and explicit donor attestation.

- [ ] `POST /api/v1/maintenance/start` — drain and start maintenance.
- [ ] `POST /api/v1/maintenance/stop` — exit maintenance safely.

Graceful shutdown lets active queries and transactions complete.
It rejects new SQL work and publishes routing changes.
`elera-lib` then selects the assigned writer or reader option.
The supervisor closes pools and stops MariaDB.

## Operations

- [ ] `GET /api/v1/operations` — list redacted operations.
- [ ] `GET /api/v1/operations/{operationId}` — inspect an operation.
- [ ] `POST /api/v1/operations/{operationId}/cancel` — cancel a cancellable operation.

Mutating operations must support `dryRun`, bounded `timeoutMs`, explicit
`confirm`, and `Idempotency-Key`. Operation records must not contain
passwords, bearer tokens, age private keys, or plaintext artifacts.

## Legacy removal checklist

These items are platform-owned migration tasks. The supervisor-side removal of
the legacy listeners is complete. The remaining entries monitor VyOS/GitOps
changes and are not implemented or validated by this repository.

- [ ] Remove MySQL backends from VyOS HAProxy.
- [ ] Configure VyOS HAProxy as HTTP-only supervisor load balancer.
- [ ] Remove VyOS `agent-check` configuration.
- [x] Remove TCP listeners `33060` and `33070` from the supervisor.
- [x] Remove `elera-check.exe` from VyOS.
- [ ] Remove VyOS Elera checker systemd units and installer.
- [ ] Remove VyOS checker environment and post-commit rewrite logic.
