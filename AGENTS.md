# AGENTS.md

## Project

Build @eliware/elera-server with Node.js 26 or later and native ESM.

## Scope and boundaries

Run MariaDB and Galera as non-root processes in a container.
Manage health, readiness, routing, and cluster control through the supervisor APIs.
Do not publish or deploy during validation.

## Layout

Keep runtime code in `src/`.
Keep launchers in `bin/`.
Keep tests in `tests/`.
Keep fixtures in `test-fixtures/`.
Keep docs in `docs/` and specifications in `specs/`.

## Development

Give each source module one defined purpose.
Keep source modules under 100 lines.
Keep test modules under 200 lines.
Keep application settings out of source files.

## Validation

Use Node.js 26 or later and npm 12 or later.
Run `npm test` for aggregate validation.
Run `npm run lint` for lint checks.
Run `npm run audit` for dependency checks.
Run `npm run format` to format files.
Run `npm run format:check` to check formatting.

## Security

Keep credentials, tokens, secrets, and private data out of logs and Git.

## Changes

Keep docs current.
Use shared Snowflake APIs from `@eliware/common`.
Follow the shared repository rules.

## Application

Run focused tests first during development.
Run one test file with `npm test -- tests/path/to/example.test.mjs`.
Run multiple test files with `npm test -- tests/path/to/first.test.mjs tests/path/to/second.test.mjs`.
Prevent repeated full-suite runs during development.
Run the full `npm test` suite for final validation before a commit, milestone, or release.

## GHCR publication

Image: ghcr.io/eliware/elera-server

Pull command: docker pull ghcr.io/eliware/elera-server:v15.0.0

Supported tags: vMAJOR.MINOR.PATCH

Architectures: linux/amd64

Visibility and access: GHCR package settings control image visibility and pull access.

Deployment boundary: Publication does not deploy. Use an immutable version tag and record its SHA-256 digest.
