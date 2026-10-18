# Elera 0.1.1 release record

This record separates local results from items required before production approval.

| Item                         | Status                    | Data                                                                                                               |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source commit                | Required at release       | Record the exact Git commit used to build the image.                                                               |
| Image digest                 | GitOps candidate recorded | `sha256:8ec29c3b0fb80ad4ee9b4ae1960a508cb25863b0cff615a28f88e00e1d1b0f44`                                          |
| Runtime identity             | Verified                  | UID 100 / GID 101 (`mysql`).                                                                                       |
| MariaDB package              | Build input               | MariaDB 12.3.3 repository configuration.                                                                           |
| Galera package               | Build input               | `galera-4` package from the configured MariaDB repository.                                                         |
| Target architecture          | Required at release       | Record each published platform manifest.                                                                           |
| SBOM                         | Required at release       | Attach the generated image SBOM.                                                                                   |
| Vulnerability scan           | Required at release       | Attach the scanner report and approval decision.                                                                   |
| Separate digest verification | Required at release       | Verify the registry digest from a separate client.                                                                 |
| Application tests            | Verified locally          | `npm test`: 100×4 coverage, zero lint warnings.                                                                    |
| Container smoke test         | Verified locally          | Non-root startup, MariaDB readiness, and supervisor startup passed.                                                |
| Data-directory safety tests  | Verified locally          | Missing, empty, explicit bootstrap, incomplete, stale, initialized, non-directory, and non-writable cases covered. |

## Known limitations

The isolated lab must validate SST/IST failure, multi-member loss, and total-cluster recovery.
It must also validate worker drain, physical storage failure, and Kubernetes policy behavior.
Local unit and smoke results do not cover these cases.

## Rollback

Rollback must use the previously approved image digest and its matching GitOps
manifest. Do not enable initialization during a regular rollback. Any
cluster bootstrap or recovery remains an explicit, audited operator action.
