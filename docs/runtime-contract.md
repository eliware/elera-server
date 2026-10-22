# Elera image runtime contract

## Deployment platform

This contract applies to the Linux container image. Elera Supervisor and the
MariaDB/Galera process it manages are not supported for direct execution on a
Windows host. Windows users must run the complete Supervisor/MariaDB/Galera
stack inside a Linux container runtime (for example Docker Desktop with its
Linux/WSL2 backend). Native Windows processes, Windows services, and direct
PowerShell/CMD launches are outside the supported deployment model.

## Identity and filesystem

The image runs as UID `100`, GID `101` (`mysql`). These paths must be writable
by that identity:

- `/var/lib/mysql` — continuous MariaDB data.
- `/run/mysqld` — MariaDB runtime sockets and state.
- `/tmp` — MariaDB/InnoDB temporary files when the root filesystem is read-only.

Managed databases expose a logical name to CLI and application callers. The
supervisor stores a generated Snowflake-backed `physical_name` internally.
The supervisor imports Snowflake ID generation from `@eliware/common` and
uses that name for MariaDB schemas, identities, grants, and credential leases.

- `/var/lib/mysql/elera-state` — writable supervisor intent state and generated
  MariaDB configuration by default. `ELERA_CONFIG_STATE_DIR` may override it.
- `/etc/elera` — optional static configuration input. ConfigMap mounts may be
  read-only.

The root filesystem can be read-only when `/run/elera`, `/run/mysqld`, and
`/tmp` are provided as writable runtime mounts. The continuous data directory
must be a mounted,
dedicated filesystem in production. A missing, read-only, non-directory, empty
without bootstrap, not fully initialized, stale, or if not suspicious data
directory causes startup to fail closed.

## Ports and probes

- `3306`: MariaDB client traffic.
- `4444`: Galera SST.
- `4567`: Galera replication.
- `4568`: Galera IST.
- `8080`: supervisor HTTP API and probes.

`/healthz` is a liveness endpoint and returns `200 ok` while the supervisor
process is alive. `/readyz` returns `200` only when MariaDB is accepting work
and the local readiness policy is satisfied. If not it returns `503`.
During cold recovery it remains `503` for `pending`, `collecting-evidence`,
`awaiting-quorum`, `cluster-unavailable`, and `blocked-ambiguous`.

Cold-recovery state is included in status responses as `recovery.state` and
uses `pending`, `collecting-evidence`, `awaiting-quorum`, `recovery-authorized`,
`bootstrapping`, `joining`, `cluster-unavailable`, or `blocked-ambiguous`.

## Startup and lifecycle

- First initialization: performed only by an explicit authenticated
  `elera-cli` operation. Startup environment flags do not enable it.
- Ordinary startup: an initialized directory starts without initialization.
  The process does not initialize system tables.
- Rejoin: a valid existing Galera directory starts without
  `--wsrep-new-cluster`. Startup does not touch or add marker files to that
  existing directory.
- Bootstrap: explicit operator-controlled workflow only. It is not inferred
  from peer no or readiness failure.
- Recovery: a controlled cold-start coordinator may restore automatically only
  after collecting quorum-backed data and acquiring a single-winner
  recovery lease. Ambiguous data remains blocked and requires an explicit
  operator-controlled recovery workflow.
- Shutdown lifecycle: the supervisor transitions through serving, draining,
  stopping, and stopped. On SIGTERM it marks readiness failed, removes itself
  from locally issued routes, broadcasts routing.drain, and lets
  supervisor-managed work complete before stopping MariaDB.
- The supervisor is not inline with direct application SQL connections.
  `elera-lib` must honor the drain event and stop assigning new work to the node.
  It must let active operations end and force-close remaining client connections at its drain deadline.
- MariaDB then receives SIGTERM and is allowed no more than the configured shutdown
  timeout to exit. If it remains alive, the supervisor sends SIGKILL.
  This is separate from the client-library drain deadline.

`ELERA_CONFIG_STATE_DIR` overrides the default state directory
`/var/lib/mysql/elera-state`.
The supervisor writes `active.intent.json`, `last-known-good.intent.json`, and
`mariadb.cnf` there. Startup fails if that directory is unavailable or
unwritable.

Usual startup does not run `mariadb-install-db`, erase data, or reinitialize a directory.
It rejects a non-empty directory without the MariaDB `mysql` system database.
The entrypoint does not repair stale or corrupted data.
First initialization requires an authenticated `elera-cli` workflow.
Container environment variables cannot enable initialization.

Failed SST/IST, non-Primary state, stale or corrupt data, and storage that fails requirements cause failure.
Readiness or process checks report the failure.
An operator must control recovery unless a valid, quorum-backed cold-start decision authorizes one winner.
Provider-level automatic primary recovery stays disabled to prevent concurrent bootstrap attempts.

## Configuration and secrets

MariaDB/Galera configuration is generated from the supervisor intent and
non-secret environment configuration. Runtime passwords are supplied through
the runtime Secret and are not placed in command-line arguments, ConfigMaps,
or generated configuration. First initialization consumes the values through
SQL stdin. They are not intentionally logged or written to temporary files.
Explicit initialization uses local Unix-socket authentication and the fixed `elera_meta` database. No root password or application database credentials are required in the runtime environment.

The lab Secret must be distinct from production credentials. The claims above
describe the intended local image behavior. Registry SBOM/scanning and real
Galera failure data remain release/lab data items, not image-unit-test
claims.

The current local image has not cleared vulnerability release inspect. Docker
Scout reports unresolved important/high findings in the Bookworm base and
installed packages. Publication requires a DevOps remediation or documented
risk-acceptance decision.

### Client-facing SQL address

Node identity is derived from `hostname -f` and `hostname -i` at startup. Persisted intent is the sole source of cluster topology after initialization. Cluster topology is established only through the explicit initialization workflow.

### Pending initialization

The explicit pending-initialization path uses `/run/mysqld/pending-init.sock`
for its private MariaDB process and readiness check. This temporary socket is
not exposed as a process port. Initialization is entered only through the
explicit authenticated workflow. Ordinary startup does not create, erase, or
repair a data directory.
