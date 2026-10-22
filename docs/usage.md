# Usage and configuration

Run Elera in a Linux container. Use Node.js 26 or later.

Build the image from the repository root. Pull `ghcr.io/eliware/elera-server:v15.0.0` for Linux on `amd64`.
Set image visibility and pull access in GHCR package settings.

Attach a dedicated volume at `/var/lib/mysql`. Attach `/run/mysqld` and `/run/elera` as writable paths.
Use an immutable image tag and recorded SHA-256 digest for deployment.

Pass settings through the container runtime. The application does not load `.env` files.
Use [.env.example](../.env.example) as a placeholder template. Replace every placeholder before use.

| Variable                       | Default                            | Use                                        |
| ------------------------------ | ---------------------------------- | ------------------------------------------ |
| `MARIADB_DATA_DIR`             | `/var/lib/mysql`                   | MariaDB data path.                         |
| `ELERA_CONFIG_STATE_DIR`       | `<data path>/elera-state`          | Intent and MariaDB configuration path.     |
| `ELERA_HTTP_PORT`              | `8080`                             | Supervisor API port.                       |
| `ELERA_QUERY_TIMEOUT_MS`       | `5000`                             | SQL query timeout in milliseconds.         |
| `ELERA_DRAIN_TIMEOUT_MS`       | `45000`                            | Client drain timeout in milliseconds.      |
| `ELERA_SHUTDOWN_TIMEOUT_MS`    | `60000`                            | MariaDB shutdown timeout in milliseconds.  |
| `ELERA_STARTUP_TIMEOUT_MS`     | `30000`                            | Startup timeout in milliseconds.           |
| `ELERA_NODE_SQL_PORT`          | `3306`                             | MariaDB client port in routes.             |
| `ELERA_CLUSTER_SIZE`           | Intent member count                | Minimum peer count for quorum checks.      |
| `ELERA_APPLICATION`            | `default`                          | Default application name.                  |
| `ROOT_TOKEN`                   | None                               | Root access token for control API calls.   |
| `ELERA_CREDENTIAL_KEY`         | None                               | Key for managed credential data.           |
| `ELERA_PEER_TOKEN`             | `ROOT_TOKEN`                       | Token for peer API calls.                  |
| `ELERA_LOAD_BALANCER_ENDPOINT` | None                               | Optional load balancer drain endpoint.     |
| `ELERA_ASSIGNMENTS_PATH`       | Data path under `elera-state`      | Optional routing assignment file.          |
| `ELERA_EVENT_VERSION_PATH`     | Runtime default                    | Optional routing event version file.       |
| `ELERA_OBSERVATION_STATE_PATH` | Runtime default                    | Optional peer observation file.            |
| `ELERA_RECOVERY_DECISION_PATH` | `/run/elera/cold-recovery.json`    | Optional recovery decision file.           |
| `ELERA_EXPLICIT_START_MODE`    | None                               | Explicit `bootstrap` or `join` start mode. |
| `SUPERVISOR_INTENT_JSON`       | Persisted intent or default intent | Optional JSON supervisor intent.           |

Set `ROOT_TOKEN` before you call the control API. Set `ELERA_PEER_TOKEN` for peer traffic. The supervisor uses `ROOT_TOKEN` when no peer token is set. Recovery startup fails closed when both tokens are unset. Set `ELERA_CREDENTIAL_KEY` before you use managed credentials.

First initialization requires an authenticated `elera-cli` operation. Usual startup does not initialize or repair a data directory.
Use the documented recovery API when the cluster cannot start from valid quorum data.

Send `SIGTERM` to stop the supervisor. The supervisor drains client work before it stops MariaDB.

Run `node examples/basic.mjs` from the repository root. The command prints a usage message.
