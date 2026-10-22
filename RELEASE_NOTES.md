# Release Notes

## 15.0.0 — 2026-10-22

### Added

- Add authenticated recovery routes for peer records, access checks, bootstrap, final status, retries, and guarded data cleanup.
- Add peer reports, rolling process checks, failover timing data, and separate read and write routes.

### Changed

- Use recovery records and Galera quorum to select a safe bootstrap candidate.
- Require a shared FQDN identity for each supervisor and address every peer by its FQDN.
- Use `@eliware/common` for Snowflake ID generation while preserving the current ID format and API.
- Use explicit bootstrap and join requests for clustered startup.
- Scope metadata tokens by application and use the canonical metadata schema.
- Split runtime code into focused modules with matching test modules.
- Upgrade Eliware packages to 15.0.0 and align repository rules with Eliware Test 15.
- Update the container startup, GHCR workflow, documentation, specifications, and repository metadata.

### Fixed

- Verify each recovery join before reporting success.
- Keep recovery APIs available during blocked startup and remove drain state after recovery.
- Retry recovery planning after peer startup failures and prevent stale timeouts from hiding readiness.
- Check join epochs when recovery snapshots are missing.

### Breaking changes

- Require every node identity and address to use a shared FQDN. Replace short hostnames and legacy cluster settings before rollout.

### Migration

- Set each node name and routable address to its shared FQDN. Use explicit bootstrap for the first node and join for later nodes.

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
