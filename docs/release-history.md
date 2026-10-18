# Release notes

## Unreleased — supervisor cold-recovery redevelopment

- Distinguish recovery-required initialized nodes from pending initialization.
- Keep authenticated recovery data, authorization, bootstrap, end,
  and retry APIs available while startup is blocked.
- Select and guard a cold-recovery winner, then restore remaining members
  sequentially with readiness gates and post-recovery routing publication.
- Add MariaDB recovery diagnostics and recovery-specific failure states.
- Verified locally with 100×4 coverage, zero lint warnings, contract checks,
  syntax checks, and type checks.

## 0.1.6 — scoped authentication and pending-init socket consistency

Patch release candidate containing focused fixes identified during local and
Kubernetes-style validation.

### Authentication

- Authenticate scoped bearer tokens against active replicated metadata using
  constant-time hash compare in the supervisor process.
- Add regression coverage for valid, invalid, malformed, and empty token
  metadata records.

### Pending initialization

- Use one shared `/run/mysqld/pending-init.sock` contract for explicit
  initialization and the MariaDB readiness check.
- Use the focused pending-init implementation from the container entrypoint
  rather than maintaining a second initialization path.
- Add regression coverage for the pending-init socket and credential-handling
  contract.

### Verification

- Supervisor test suite passes with 100×4 coverage and zero lint warnings.
- New local Docker E2E lab passes initialization, Galera joins, scoped token
  provisioning, backup verification, and restore verification.

## 0.1.5 — local E2E lab and lifecycle hardening

Unreleased patch release candidate for the then test image.

### Runtime and lifecycle

- Add explicit pending-init, bootstrap, join, and rejoin handoff behavior.
- Require Galera quorum for readiness and propagate drain state across
  supervisors.
- Allow active SQL sessions to become stable during graceful shutdown before MariaDB
  termination.
- Replace shell entrypoints with Node.js ESM entrypoints.

### Local validation

- Add a new seven-service Docker lab with three Galera nodes, a standalone
  node, HTTP-only HAProxy, backup-dev, and backup-NAS.
- Add focused E2E modules for lifecycle, metadata, routing, backup, and CLI
  interoperability.
- Validate metadata provisioning, scoped application credentials, backup and
  verification, NAS move, and standalone restore verification.
- Make the E2E runner quiet by default while retaining filtered failure
  diagnostics and a `--verbose` mode.

## 0.1.4 — hardened local and Kubernetes-style startup validation

Unreleased patch release containing the locally verified follow-up hardening
for the then image candidate.

### Runtime safety

- Require `MARIADB_ROOT_PASSWORD` for explicit first initialization.
- Keep initialization disabled during ordinary Compose startup so a local
  `.env` cannot silently enable initialization. Initialization is CLI-driven.
- Preserve fail-closed handling for empty, suspicious, stale, or initialized
  MariaDB data directories.

### Tests and validation

- Add regression coverage for the entrypoint bootstrap contract.
- Add regression coverage for read-only static configuration and writable
  runtime mounts.
- Add Compose coverage for the non-bootstrap default.
- Verify the image with UID/GID `100:101`, a read-only root filesystem, and a
  read-only `/etc/elera/supervisor.yaml` attach.
- Verify explicit initialization followed by a non-bootstrap start again against
  the existing data volume.

## 0.1.3 — Kubernetes runtime-path separation

Patch release aligning the supervisor image with read-only ConfigMap mounts in
Kubernetes.

### Runtime and deployment

- Move writable supervisor state and generated MariaDB configuration to
  `/run/elera`.
- Keep `/etc/elera` available for static, potentially read-only configuration.
- Prepare `/run/elera` with ownership `100:101` in both image Dockerfiles.
- Add Kubernetes-style regression coverage proving runtime state is separate
  from static configuration.
- Preserve fail-closed data-directory and explicit-bootstrap safeguards from
  `0.1.2`.

The then Kubernetes candidate must attach `/run/elera` as writable runtime
storage, such as an `emptyDir`, before deployment. SBOM, vulnerability,
signature, digest-verification, and real Galera/Kubernetes lifecycle data
remain release-gate artifacts.

## 0.1.2 — fail-closed data-directory hardening

Patch release focused on preventing accidental MariaDB initialization or
mutation of continuous data during ordinary startup.

### Protection and runtime

- Reject missing, non-directory, non-writable, empty, not fully initialized,
  stale, or suspicious data directories before MariaDB starts.
- Allow `mariadb-install-db` only for an explicitly requested bootstrap on a
  genuinely empty directory.
- Reject bootstrap mode when an existing MariaDB system database is available.
- Prevent modifying existing data directories during ordinary start again or rejoin.
- Add focused regression coverage for all data-directory decisions.
- Document the runtime contract, release data requirements, known
  limitations, and rollback procedure.

This release remains requires DevOps SBOM, vulnerability, signing, separate
digest verification, and real Galera failure-test data before production
approval.

## 0.1.1 — non-root container hardening

Patch release focused on reducing container privileges while preserving the
existing supervisor and MariaDB startup behavior.

### Protection and runtime

- Run the production and development images as the non-root `mysql` user.
- Pre-create and give ownership of `/run/mysqld`, `/var/lib/mysql`, and
  `/etc/elera` during image construction.
- Use MariaDB standard root authentication during first-time data-directory setup so
  initialization can complete without an operating-system root process.
- Document the non-root runtime and persistent-volume ownership requirements.

## 0.1.0 — baseline supervisor

Initial development release of the Elera MariaDB supervisor container and
control plane.

### Supervisor runtime

- Node.js supervisor process manages the MariaDB child process lifecycle.
- Graceful shutdown and drain handling stop admission of new work, allow
  active database work to end, and stop MariaDB cleanly.
- `/healthz` and `/readyz` expose liveness and readiness independently.
- Cached local observations prevent issuing a new SQL check for every request.
- Structured lifecycle, signal, error, and operational logging is provided
  through `@eliware/common`.

### Cluster and routing

- Standalone and three-node Elera/Galera operating modes are supported by the
  container configuration.
- Peer observations, quorum check, node lifecycle state, and durable
  observation storage are represented as separate supervisor modules.
- Routing decisions produce connection bundles with ordered read and write
  candidates, application policy, weights, and expiry information.
- Routing updates can be consumed through an authenticated WebSocket event
  stream, with HTTP API refresh available to clients as a fallback.
- The intended deployment uses HAProxy for HTTP supervisor traffic only.
  applications set up SQL connections directly to bundle endpoints.

### Control API

- Bearer-token authentication protects control-plane operations.
- Initialization and first-boot lifecycle endpoints are available for
  controlled setup.
- Cluster status, peer observations, quorum, traffic, drain, and routing
  resynchronization endpoints are available.
- Managed database/account operations expose declarative metadata and grant
  policy handling.
- Metadata, encrypted artifact, reconciliation, and restore-support endpoints
  provide the supervisor state required by the Elera ecosystem.
- Intent validation, state management, reconciliation, and MariaDB config
  rendering are separated into independently testable modules.

### Contracts and integration

- Routing-bundle and supervisor-intent JSON schemas and fixtures are included.
- The supervisor consumes the published `@eliware/elera-lib@0.1.0` package.
  no sibling checkout or local package copy is required.
- Docker Compose lab configuration covers three cluster nodes, a standalone
  restore target, HTTP HAProxy, backup workstation, and NAS simulator.
- Apache-2.0 licensing and third-party notices are included. Bundled external
  software remains under its related license.

This release establishes the baseline contracts and runtime structure. Galera
production bootstrapping, hardened secret-management policy, Kubernetes
deployment rollout, and later operational automation remain follow-up work.
