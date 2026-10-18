# Supervisor Architecture Plan

## Purpose

The supervisor turns MariaDB/Galera into a managed process for Kubernetes and
local development. It owns cluster authority, lifecycle, routing decisions,
metadata administration, and the local MariaDB process. Applications use the
separate `@eliware/elera-client` package. They do not use supervisor internals.

This document contains supervisor implementation details intentionally omitted
from `elera-lab/core_flow.md`. Core Flow defines process behavior and
operator/application workflows. This plan defines how this supervisor realizes
those behaviors.

## Target architecture

```text
Supervisor process
├── Runtime composition
│   ├── configuration
│   ├── dependency wiring
│   └── process lifecycle
├── Control plane
│   ├── authentication and authorization
│   ├── initialization
│   ├── metadata/provisioning
│   ├── routing bundles
│   ├── telemetry
│   └── CLI/API routes
├── Cluster plane
│   ├── local MariaDB state
│   ├── peer observations
│   ├── quorum evaluation
│   ├── writer assignment
│   └── cold-recovery coordinator
├── Data plane
│   ├── MariaDB process
│   ├── local root-socket SQL client
│   └── health/readiness probes
└── Lifecycle plane
    ├── startup
    ├── drain/quiesce
    ├── SIGTERM shutdown
    ├── restart/rejoin
    └── timeout/force-kill
```

## Ownership boundaries

- MariaDB owns SQL execution.
- Supervisor owns authority, lifecycle, cluster state, and routing decisions.
- `elera-lib` owns only shared contracts and pure helpers consumed by multiple
  repositories. Supervisor-specific lifecycle and recovery logic stays local.
- `elera-client` owns application SQL pools and client-side failover.
- CLI owns administrative workflows and SQL command passthrough.
- Persisted intent owns startup-critical configuration.
- Runtime state owns mutable health, routing, telemetry, and recovery state.

## Recovery model

The cold-recovery coordinator is the only component allowed to authorize a
cluster bootstrap. Recovery is an explicit state machine:

```text
observing → candidate-selected → quorum-authorized → bootstrapping
          → primary-verified → join-enabled → complete
```

Conflicting or incomplete data transitions to `blocked`. It must not
trigger an automatic bootstrap fallback.

Each supervisor publishes authenticated observations containing:

- node identity.
- cluster identity.
- local Galera state.
- sequence number.
- `safe-to-bootstrap` state.
- recovered sequence number.
- data-directory status.
- observation epoch and timestamp.

Quorum must agree on the exact recovery epoch, winner, cluster identity, and
data digest before bootstrap. Only the elected winner starts MariaDB with
bootstrap arguments. Other nodes remain stopped or join-only until the winner
proves `Primary` and expected membership.

A cleanly stopped member starts again without bootstrap selection.
Cold recovery uses a separate path.

Startup must refuse missing or invalid data, conflicting cluster identity,
ambiguous sequence numbers, changed data after authorization, not sufficient quorum, and failed Primary formation.

## State separation

Keep three classes of state separate:

1. Persisted intent: cluster membership, MariaDB settings, and startup-critical
   configuration.
2. Durable recovery state: recovery decisions, epochs, data digests, leases,
   and audit records.
3. Ephemeral runtime state: health, routing, telemetry, and current lifecycle.

## Routing and telemetry

All supervisor SQL administration uses the local root socket. The supervisor
does not use `elera-client` for administration. That package may remain a
development/integration dependency for consumer-style tests only.

A single routing-assignment process must consume validated observations and
metadata, then send versioned bundles and explicit events:

- `routing.update`.
- `routing.drain`.
- `routing.recovery`.
- `routing.shutdown`.

The health and assignment cycle runs approximately once for each second. Telemetry
aggregation runs approximately once for each ten seconds. Routing state and
telemetry must not require SQL queries from health probes.

## Lifecycle ordering

Shutdown ordering must be deterministic:

```text
reject new control work
→ publish shutdown/drain event
→ quiesce SQL
→ SIGTERM MariaDB
→ wait configured timeout
→ SIGKILL only if necessary
→ close HTTP/WebSocket listeners
```

`/healthz` remains available during drain and is separate of SQL. `/readyz`
reports non-ready while draining, recovering, or lacking the required Galera
state.

## Implementation plan

Status: `[x]` complete, `[~]` incomplete/in progress, `[ ]` not complete.

1. [ ] Split `src/main.mjs` into a narrow composition root and focused startup,
       runtime, and shutdown coordinators.
2. [~] Formalize the cold-recovery state machine and make its coordinator the sole
   bootstrap authority.
3. [ ] Separate persisted intent, durable recovery/audit state, and ephemeral
       runtime state.
4. [~] Validate and authenticate peer observations, with sequence and data
   directory data. Authenticated peer responses are at this time bound to the
   expected node identity. Full data authentication remains open.
5. [~] Require quorum agreement on recovery epoch, winner, cluster identity, and
   data digest. Identified distinct quorum acknowledgements are enforced.
   authenticated epoch/data agreement remains open.
6. [~] Enforce winner-only bootstrap, join-only followers, and Primary/membership
   verification before end. Startup arguments and join verification enforce
   the code-level boundary. Real SST/IST and runtime end remain open.
7. [~] Preserve a cleanly stopped member as a rejoin path. The startup
   decision marks an existing Primary as join-ready. Live rejoin validation
   remains open. The local lab is currently new and uninitialized, so SST/IST
   validation cannot run until the explicit initialization workflow is executed.
8. [ ] Use one module for routing assignment and versioned bundle/event publication.
9. [ ] Keep the one-second routing cycle separate from ten-second telemetry
       aggregation.
10. [ ] Make shutdown refusal, event publication, SQL quiescing, MariaDB signal
        handling, timeout, and listener closure deterministic.
11. [x] Keep supervisor administration on the local root socket and preserve the
        client dependency boundary.
12. [ ] Distinguish operational safety fallbacks from prohibited legacy
        compatibility behavior.
13. [x] Align every non-barrel implementation module with a focused test, while
        retaining deliberate composition and cross-cutting exceptions.
14. [~] Update runtime, API, recovery, and release documentation to match the
    authority model.
15. [ ] Record intentional exceptions in `known_drifts.md`.

## Validation gates

Before committing the plan implementation:

- run the complete supervisor suite and verify 100×4 coverage.
- run lint, typecheck, contract validation, audit, and package checks.
- verify CI on Ubuntu and Windows.
- test clean start again, cold recovery, quorum loss, conflicting data,
  winner/joiner failure, SST/IST, drain, shutdown, and rejoin behavior.
- inspect the final source-to-test inventory and dependency boundaries.
