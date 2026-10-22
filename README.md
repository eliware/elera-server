# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/elera-server [![License](https://img.shields.io/github/license/eliware/elera-server)](https://github.com/eliware/elera-server/blob/main/LICENSE) [![CI](https://github.com/eliware/elera-server/actions/workflows/ci.yaml/badge.svg)](https://github.com/eliware/elera-server/actions/workflows/ci.yaml)

Non-root MariaDB and Galera container supervisor with health, readiness, routing, and cluster control APIs

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Setup](#setup)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Configuration](#configuration)
- [Operations](#operations)
- [Support](#support)
- [Links](#links)
- [License](#license)

## Features

Non-root MariaDB and Galera container supervisor with health, readiness, routing, and cluster control APIs.

## Requirements

- Use Node.js 26 or later.
- Run the supervisor in a Linux container.

## Setup

Run npm ci to install the locked packages.

## Usage

Build the container image from this repository root.
Pull `ghcr.io/eliware/elera-server:v15.0.0` for Linux on `amd64`.
Use an immutable version tag and recorded SHA-256 digest for deployment.
GHCR package settings control image visibility and pull access.
Read the [documentation index](docs/README.md) and [specification index](specs/README.md).
Read [release notes](RELEASE_NOTES.md) for released changes.

## Development

Keep code and tests in their assigned folders.

## Testing

Run npm test for repository validation.

## Troubleshooting

Read [troubleshooting](docs/troubleshooting.md) when a command fails.

## Security

Keep tokens, passwords, keys, and runtime data out of Git.

## Configuration

Read [configuration and usage](docs/usage.md) before you set runtime values.

## Operations

Use the repository docs for supported operations.

## Support

For help, questions, or to chat with the author and community, visit:

[![Discord](https://eliware.org/logos/discord_96.png)](https://discord.gg/M6aTR9eTwN)[![eliware.org](https://eliware.org/logos/eliware_96.png)](https://discord.gg/M6aTR9eTwN)

**[eliware.org on Discord](https://discord.gg/M6aTR9eTwN)**

## Links

- [Home Page](https://eliware.org)
- [GitHub Org](https://github.com/eliware)
- [GitHub Repo](https://github.com/eliware/elera-server)
- [Bug Reports](https://github.com/eliware/elera-server/issues)
- [Discord](https://discord.gg/M6aTR9eTwN)

## License

[MIT © Eliware](LICENSE)
