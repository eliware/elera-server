# Cold recovery contract

Cold recovery is a quorum-certified startup protocol. It is not inferred from
peer no, readiness failure, or a missing data directory.

Each supervisor publishes authenticated data containing its Galera UUID,
saved and recovered sequence numbers, `safe_to_bootstrap`, data-directory
status, current `Primary`/`Synced` state, data generation, and timestamp.
Each received record must be new and match the recovery cluster UUID. A missing peer is allowed only when valid records remain from more than half of the members.

Supervisors select the sole valid `safe_to_bootstrap` member, or if not the
highest recovered sequence number. A node-name tie-break is permitted only
when UUID and sequence number are same. Conflicting histories, divergent
UUID mismatches, stale data, or a quorum lacking the required member count prevent recovery.

The result is an atomically persisted recovery epoch containing the cluster
UUID, data digest, winner, sequence number, timestamp, and quorum members.
Its legal progression is `evidence` → `authorized` → `bootstrapping` →
`complete`. Blocked epochs may only be retried after new data is
collected.

Only the exact epoch’s quorum may authorize recovery. Only its winner may
start with `--wsrep-new-cluster`. The winner must become `Primary` and `Synced`,
and every configured member must report the same available Primary membership
before the winner publishes an authenticated `bootstrap-complete` handoff.
Joiners remain stopped until that matching handoff is observed, then
join without bootstrap and verify the UUID, SST/IST completes, membership, and `Synced`.

Readiness remains `503` while recovery is pending, blocked, bootstrapping, or
joining. Failed bootstrap, failed SST/IST, corrupted state, stale epochs, or
missing quorum fail closed. No recovery path deletes data, runs
`mariadb-install-db`, deletes data, or mutates a suspicious data directory
implicitly. The explicit winner-only, quorum-authorized bootstrap step may
promote `safe_to_bootstrap` in `grastate.dat` immediately before starting
MariaDB with `--wsrep-new-cluster`. This is auditable and does not occurs during
ordinary startup.

Recovery endpoints:

- `GET /api/v1/cluster/cold-recovery/evidence`
- `GET /api/v1/cluster/cold-recovery/status`
- `POST /api/v1/cluster/cold-recovery/plan`
- `POST /api/v1/cluster/cold-recovery/retry`
- `POST /api/v1/cluster/cold-recovery/bootstrap`
- `POST /api/v1/cluster/cold-recovery/complete`

Write endpoints require the recovery-write scope or authenticated internal
peer access. Data, decisions, authorizations, bootstrap, join, prevent, and
refusal outcomes are auditable.

The local startup coordinator collects authenticated peer lease claims. HTTP
callers cannot create recovery authorization by submitting member names.

An expired recovery lease is replaced under an exclusive cleanup lock. An
operator must inspect an expired bootstrap operation lock before removing it.
