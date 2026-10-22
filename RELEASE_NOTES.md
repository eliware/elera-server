# Release Notes

## 15.0.0 — 2026-10-22

### Added

- Add authenticated APIs for cluster lifecycle, cold recovery, node records, guarded data cleanup, metadata, routing, and health.
- Add managed identities, applications, databases, grants, credential leases, and scoped tokens through the canonical metadata schema.
- Add routing observations, peer updates, event versions, client streams, and deterministic read and write donor selection.
- Add clean-start markers that survive supervisor processes and prevent avoidable cold recovery.
- Add a runnable example, Galera lifecycle checks, rolling process probes, failover timing, and routing checks.
- Add API, runtime, recovery, routing, and directive specifications with documentation indexes.
- Add CI reports and a GHCR workflow that validates tags and records image digests.

### Changed

- Require FQDNs for runtime node names and peer addresses.
- Use saved supervisor intent for cluster membership and remove legacy cluster environment fallbacks.
- Use explicit bootstrap for the first cluster node and explicit join requests for later nodes.
- Select recovery candidates from current, identity-matched node records and quorum history.
- Require exact recovery epoch lease grants before bootstrap authorization.
- Require matching Primary state, cluster UUID, membership, SST or IST, and final handoff before recovery succeeds.
- Keep recovery APIs available while startup is blocked or SQL is unavailable.
- Use `@eliware/common` for Snowflake IDs and preserve the existing ID format and API.
- Split runtime, API, routing, lifecycle, metadata, and recovery code into focused modules with matching tests.
- Run MariaDB and the supervisor as non-root processes with the configured data directory and saved intent.
- Replace the older compose setup and backup containers with the maintained supervisor workflow and examples.
- Align deployment settings, formatting, module limits, repository rules, and Eliware packages with version 15.0.0.
- Use full Git history in CI and keep test and coverage reports.

### Fixed

- Reject stale, misattributed, conflicting, or quorum-short recovery records before startup.
- Retry recovery planning after peer failures and prevent stale readiness timers from hiding a verified join.
- Keep joiners stopped until the approved bootstrap final handoff arrives.
- Remove propagated drain state after recovery and prevent startup races in peer listeners.
- Fence routing resynchronization through the supervisor and verify the selected donor before it ends.
- Reject embedded usernames and passwords in peer URLs.
- Preserve API version and request ID fields when a control route returns an error.
- Fix metadata ownership checks, identity token revocation, and failed join handling.

### Breaking changes

- Replace short hostnames and legacy cluster settings with FQDN node names, routable peer addresses, and saved supervisor intent.
- Use explicit bootstrap for the first cluster member and explicit join operations for other members.

### Migration

- Set each node name and peer address to its FQDN.
- Save cluster membership in supervisor intent and remove legacy cluster environment settings.
- Configure supervisor tokens and credential encryption keys before using protected APIs or managed credentials.

### Security

- Require credential scopes for lease and refresh routes, and reject scoped tokens after identity revocation.
- Reject forged, stale, mismatched, and unauthenticated recovery lease claims.
- Require authorization headers for WebSocket connections and enforce API scopes for protected operations.

## 0.1.6 — 2026-08-28

### Changed

- Add constant-time checks to scoped authentication and share pending initialization socket handling.

## 0.1.5 — 2026-08-27

### Added

- Add local end-to-end testing and lifecycle coverage for cluster operations.

## 0.1.4 — 2026-08-27

### Fixed

- Keep first initialization explicit and configuration read-only.

## 0.1.2 — 2026-08-27

### Fixed

- Reject unsafe MariaDB data directories before startup.

## 0.1.1 — 2026-08-27

### Changed

- Run MariaDB and the supervisor as non-root processes.

## 0.1.0 — 2026-08-27

### Added

- Add the initial MariaDB supervisor, health APIs, and cluster control plane.
