# Elera Ecosystem Function Checklist

Work proceeds as parallel vertical slices across `elera-lib`, the supervisor,
and `elera-cli`. Check an item only when it is implemented, tested, and
documented. Every sprint ends with an interoperability smoke test.

## Sprint 0 — Repository and contract baseline [complete]

- [x] Bootstrap all three Node.js 26/ESM repositories with CI, Knit, licenses, and tests.
- [x] Set up published-package consumption between supervisor, `elera-cli`, and `elera-lib`.
- [x] Define `/api/v1`, response envelopes, error handling, and initial scope vocabulary.
- [x] Set up `elera_meta` as the authoritative metadata database name.
- [x] Add machine-readable schemas and shared contract fixtures to all three repositories.
- [x] Add contract verification to all three repositories and CI.

## Sprint 1 — Local SQL and process lifecycle [complete]

### Library

- [x] Do generic profiles, routing, pool health, quarantine, transaction pinning, TLS, and cleanup.
- [x] Do not retry mutations with unknown sending status.

### Supervisor

- [x] Start and own MariaDB as PID child with bounded startup and graceful shutdown.
- [x] Use `elera-lib` for the local SQL connection.
- [x] Provide `/healthz` and `/readyz` with one-second cached health checks.

### CLI and interoperability

- [x] Provide `health`, `ready`, `status`, stable exits, and SQL smoke support.
- [x] Verify library, supervisor, CLI, and real MariaDB interoperability.

### Sprint 1 certification data (historical)

- Production image builds from the Elera repository context with the published
  `@eliware/elera-lib@0.2.0` resolved from npm.
- The standalone supervisor exposes `/healthz` before MariaDB is available and
  issues an advertised `elera-single:3306` bundle to remote consumers.
- `elera-cli sql-smoke` passes from the separate `backup-dev` container through
  the supervisor lease endpoint to MariaDB.
- Local tests pass at 100×4 coverage with zero lint warnings. The pushed
  supervisor CI run passed on both Ubuntu and Windows.
- The GitHub Actions Node.js 20 action warning is informational only. It does
  not change the Sprint 1 gates.

## Sprint 2 — GitOps intent, rendering, and first boot

### Shared contract

- [x] Define the versioned supervisor intent schema: cluster members, MariaDB settings, routing policy, and drain policy.
- [x] Keep tokens, passwords, TLS inputs, and other sensitive values in separate GitOps Secrets.
- [x] Define needed/active hashes and change classes: no-op, reload, start again, or unsafe.

### `elera-lib`

- [x] Add generic administrative SQL and transaction-safe migration primitives.
- [x] Keep supervisor and CLI policy out of the public library API.

### Supervisor

- [x] Validate intent and atomically create standardized MariaDB/Elera files.
- [x] Keep a last-known-good rendered copy and keep active state unchanged on failure.
- [x] Reconcile config changes and expose needed/active/status plus plan/apply operations.
- [x] Make standalone first boot idempotent and reject unsafe bootstrap changes.

### CLI and interoperability

- [x] Add config inspection, plan, apply, and verify commands.
- [x] Run first boot from supervisor intent against standalone Docker MariaDB.
- [x] Verify no-op, reload, start again, invalid-config, and rollback behavior across all three repos.

### Sprint 2 implementation data

- The standalone lab generates `/run/elera/mariadb.cnf` from the validated intent
  before launching MariaDB and reports `/readyz` 200 after SQL recovery.
- Repeated initialization applies succeed without duplicate-user/database errors.
- Intent plan/apply/verify endpoints return stable hashes. Unsafe membership
  changes are rejected with `409 UNSAFE_INTENT_CHANGE`.
- Supervisor, `elera-lib`, and `elera-cli` test suites and lint pass. Reload,
  start again, invalid-input, and write-failure coverage is exercised by the
  reconciliation, API, CLI, and state-layer tests.

### Sprint 2 certification

Sprint 2 is complete. The contract, supervisor rendering/reconciliation,
standalone first boot, generic library primitives, CLI workflows, and their
verification gates are implemented and tested. Elera cluster formation and
metadata provisioning remain intentionally deferred to Sprints 3 and 4.

Post-rebrand certification data: the Elera supervisor workflow passed on
both Ubuntu and Windows in run 33036380785. The Elera CLI entrypoint correction
passed on both platforms in run 33036858246. And the Elera library rebrand
workflow passed on both platforms in run 33036762276.

## Sprint 3 — `elera_meta` metadata foundation

### `elera-lib`

- [x] Support generic schema migration, transaction, and verification operations.

### Supervisor

- [x] Initialize replicated `elera_meta` idempotently and verify volume/schema state before mutation.
- [x] Create optional bootstrap/SST and health accounts safely and expose metadata status, initialize, and verify operations.

### CLI and interoperability

- [x] Do `init`, metadata initialize, and metadata verify commands.
- [x] Require root-token confirmation for first-boot mutations.
- [x] Verify repeated initialization on standalone and Elera nodes.

### Sprint 3 certification

Sprint 3 is complete. It includes generic administrative transaction primitives and idempotent `elera_meta` initialization.
It also includes metadata status, initialize, and verify APIs.
Optional SST and health account provisioning, explicit CLI confirmation, and mirrored tests are implemented.
Historical metadata migration replay is outside this process.
All three repositories pass 100×4 coverage and zero-warning lint.

## Sprint 4 — Elera lifecycle, observations, and quorum

### `elera-lib`

- [x] Accept supervisor-selected direct node sets without embedding Elera policy.
- [x] Preserve safe failover only in a valid, versioned route bundle.

### Supervisor

- [x] Do bootstrap eligibility, bootstrap, join, keep, and recovery planning.
- [x] Replace authenticated health/topology observations between supervisors.
- [x] Type quorum. Reject stale, contradictory, or unsafe observations.
- [x] Monitor synced state, primary component, node identity, health, load, and drain state.
- [x] Continue observations across supervisor restarts when `ELERA_OBSERVATION_STATE_PATH` is configured.

### CLI and interoperability

- [x] Do cluster status, bootstrap, join, keep, and recovery commands.
- [x] Bootstrap and inspect a three-node Docker Elera cluster.
- [x] Verify topology and direct `3306` connectivity from every supervisor.

Sprint 4 runtime results: the Docker Desktop lab formed three `Synced/Primary` nodes.
Each node accepted direct TCP SQL on local port `3306`.
Quorum required two new observations and reported false after one node stopped.
It returned true after that node rejoined with `wsrep_cluster_size=3` and `wsrep_ready=ON`.

## Sprint 5 — Managed databases, identities, and scoped credentials

### `elera-lib`

- [x] Accept credential leases through a generic injected provider.
- [x] Replace credentials and recycle pools without logging secrets.

### Supervisor

- [x] Store application databases, identities, accounts, grants, token metadata, and application mappings in `elera_meta`.
- [x] Provision runtime, readonly, migration, reporting, and admin identities idempotently.
- [x] Create, change, revoke, and verify credentials and grants. Exclude system schemas.

### CLI and interoperability

- [x] Do database, identity, account, grant, token, and credential commands.
- [x] Map scoped bearer tokens to applications/identities.
- [x] Verify actual MariaDB privileges through API, CLI, and library connections.

Sprint 5 runtime results: the Docker lab initialized canonical `elera_meta`.
It provisioned the `payments` database and `runtime` identity.
It issued an encrypted credential lease with direct-node routes and authenticated a MariaDB query.
The `backup-dev` container ran `elera-cli database-list` and `sql-smoke` successfully.
The separate `elera-lab` repository maintains the executable lab harness.

## Sprint 6 — Routing decisions and HTTP API bundles

### `elera-lib`

- [x] Consume bundles containing credentials, database, ordered writer candidates, and reader candidates.
- [x] Send writes only to assigned writer candidates and reads to permitted readers.
- [x] Preserve transaction pinning and refresh expired bundles through HTTP API.

### Supervisor

- [x] Give per-application writer order through quorum decisions.
- [x] Recalculate routes from synchronization, health, load, weights, and drain state at approximately one-second intervals.
- [x] Use hysteresis/recovery windows to prevent writer thrashing.
- [x] Expose bundle, lease, refresh, and route inspection endpoints.

### CLI and interoperability

- [x] Inspect writer assignments, route candidates, and bundle versions.
- [x] Start an application using only endpoint, scoped token, database, and identity.
- [x] Verify writes follow assigned writers and reads use allowed readers.

Sprint 6 runtime results: a clean Docker lab formed all three Galera nodes.
The supervisor route endpoint returned ordered writer and reader candidates for `payments`.
`elera-cli routes payments --json` returned the same bundle version through a supervisor endpoint.

## Sprint 7 — WebSocket events and graceful draining

### `elera-lib`

- [x] Open an authenticated WebSocket stream through the HTTP VIP.
- [x] Apply versioned route, writer, reader, drain, and recovery events. Events contain no SQL or dump data.
- [x] Reconnect with backoff. Use HTTP API bundle refresh when unavailable.
- [x] Find event gaps and resynchronize by bundle version.
- [x] Stop new work, end active transactions, and recycle affected pools during drain.

### Supervisor

- [x] Publish meaningful versioned changes plus heartbeat/ping-pong liveness.
- [x] Expose routing stream and resync endpoints while keeping the API stateless.
- [x] Publish drain events before controlled graceful MariaDB shutdown.

### CLI and interoperability

- [x] Keep HTTP API for management/recovery and add node/application drain commands.
- [x] Verify approximately one-second updates, WebSocket loss fallback, and rolling drains.

## Sprint 8 — Reconciliation and metadata-first restore

### `elera-lib`

- [x] Provide generic SQL connection quiesce and verification hooks without exposing supervisor- or CLI-specific dump/restore orchestration.
- [x] Verify credentials, privileges, schema, data, and application access without JSON dump transport.

### Supervisor

- [x] Add metadata reconcile plan/apply/verify operations for managed databases and identities.
- [x] Add account/grant restore plan/apply/verify operations for logical account state.
- [x] Restore `elera_meta` and logical account state independently of system schemas.

### CLI and interoperability

- [x] Do CLI reconcile plan/apply/verify commands.
- [x] Continue using native `mariadb-dump` and `mariadb` streams.
- [x] Complete metadata-first restore in Docker Desktop without raw system-schema files. Verified through the dev → NAS → standalone lab path.

Sprint 8 runtime results: `mariadb-dump` produced SQL and `SUPERVISOR-METADATA.json`.
The artifact moved to the simulated NAS using SSH and then to the dev workstation.
The restore applied metadata before application SQL.
The restored table was verified on the standalone Supervisor/MariaDB target.
Exported grants contain no passwords or password hashes.

## Sprint 9 — GitOps hardening and optional encrypted artifacts

### `elera-lib`

- [x] Materialize short-lived credentials and artifacts with deterministic cleanup.
- [x] Do not expose age keys or plaintext secret material through logs or generic library APIs.

### Supervisor

- [x] Use GitOps Secrets/operator artifacts as the initial home for SSH, `known_hosts`, TLS, and backup inputs.
- [x] Add age-encrypted artifact storage only when restore workflows demonstrate the require. Do not store private keys in `elera_meta`.

### CLI and interoperability

- [x] Add optional artifact CRUD, verification, and materialization commands.
- [x] Verify encrypted artifacts survive backup/restore and cannot be returned as plaintext accidentally.

Sprint 9 data (historical): the supervisor stores and returns only age ciphertext and
metadata. The CLI materializes artifacts only for a child operation and removes
the temporary file directory afterward. Focused unit tests cover CRUD,
checksum verification, age process failures, GitOps-mounted input resolution,
materialization cleanup, and metadata-first backup/restore sidecars. All three
repositories pass strict 100×4 coverage with zero lint warnings.

## Sprint 10 — Local lab validation

### Supervisor and `elera-lib`

- [x] Keep the supervisor image available of transitional agent-check listeners `33060`/`33070`.
- [~] Validate direct application-to-node `3306` access and lab NetworkPolicies.

### CLI and operations

- [x] Provide diagnostics and rollback checks for the HTTP-only lab routing path.
- [~] Verify graceful drains through the lab HAProxy/Cilium simulation.

### VyOS interoperability

- [x] Configure the lab HAProxy as an HTTP-only supervisor load balancer.
- [x] Validate `/healthz`, `/readyz`, WebSocket upgrades/timeouts, and stateless API failover at the Docker/integration-test layer.
- [ ] Validate the complete fresh-init, bootstrap, join, routing, drain, start again, failure, backup, and restore lifecycle.

Status: `[x]` means verified complete. `[~]` means not fully verified. `[ ]` means not started or unverified.

The Sprint 10 checklist is the current validation baseline.
Historical claims above do not replace current results.
Sprint 10 is local-only. Its results must cover the complete Docker lab.
The lab includes a three-node Elera cluster, a standalone Elera node, and an HTTP-only HAProxy simulation.

It also includes example clients and dev/NAS backup and restore.
It must validate new initialization, Galera bootstrap and join, routing updates, WebSocket fallback, and graceful drains.
It must also validate rolling restarts, failure recovery, and credential or metadata restoration.

The production MySQL cluster, its HAProxy SQL frontends, `agent-check`, `elera-check.exe`, installer, and systemd units remain active.
This project will not remove those components.
Kubernetes validation is deferred to Sprint 11.

## Sprint 11 — Kubernetes validation

### All repositories

- [ ] Deploy the released Elera image and manifests to the isolated Kubernetes environment.
- [ ] Validate PVC binding, worker placement, anti-affinity, NetworkPolicies, probes, PDB behavior, and Argo ordering.
- [ ] Validate writer assignment, reader failover, supervisor failure, event-stream fallback, graceful drains, and rolling worker reboots.
- [ ] Validate new initialization, Galera bootstrap/join, cold recovery, quorum loss, split-brain refusal, and controlled recovery.
- [ ] Validate backup/restore and restore verification against standalone Elera.
- [x] Replace local links with released package versions and verify package/image contents.

### Release interoperability

- [ ] Verify image signature/attestation, digest pinning, SBOM, vulnerability data, and release provenance.
- [ ] Complete the Kubernetes approval run and document rollback and operational handoff.
- [ ] Keep application migration and legacy MySQL/HAProxy removal out of Sprint 11. Schedule them only after all consumers migrate.
