# Swissy

A self-hosted developer toolbox for everyday utilities, test inboxes, and webhook debugging.

Swissy brings common development tasks into one web interface: generate one-time passwords, inspect incoming email and HTTP requests, transform text, edit images, and share snippets. It runs as a single Go binary with an embedded web UI and SQLite storage.

## Features

| Tool | What it does |
| --- | --- |
| TOTPs | Store named secrets and generate time-based one-time passwords. |
| Mails | Create domains and mailboxes, receive email over SMTP, and see incoming messages live. Raw email storage uses S3-compatible object storage. |
| Logins | Store usernames, passwords, and optional TOTP secrets with copy controls. |
| Text | Format JSON and SQL; encode/decode Base64 and URLs; hash text; manipulate lines; convert JSON, YAML, TOML, CSV, and XML; generate Go structs and TypeScript types. |
| Time | View world clocks and work with time zones and timestamps. |
| Image | Crop, resize, and export images as PNG, JPEG, or WebP in the browser. |
| Markdown | Edit Markdown with live preview, local draft persistence, and print/PDF support. |
| QR | Generate downloadable PNG QR codes for text, URLs, Wi-Fi, and other templates. |
| Pastes | Share syntax-highlighted snippets with raw URLs and optional expiration. |
| Webhooks | Capture requests at unique endpoints and inspect methods, headers, query strings, and bodies live. |

## Quick start

Install Go 1.26 or newer, then run from the repository root:

```sh
make run
```

Open <http://localhost:8080>. This command stores data in `./data/swissy.db` and starts the SMTP receiver on port `2525`.

For a local instance bound to loopback only:

```sh
mkdir -p data
SWISSY_DB=./data/swissy.db HTTP_ADDR=127.0.0.1:8080 SMTP_ADDR=127.0.0.1:2525 go run ./cmd
```

S3 is optional for starting the application. Configure it before receiving email if you need to retain and retrieve raw message content; without it, only message metadata is stored.

## Build and check

```sh
make build
go test ./...
```

The binary is written to `bin/swissy`. The frontend uses embedded HTML, CSS, and JavaScript and requires no separate Node.js build.

Container builds use the root `Dockerfile` with Compose and env configuration in `build/`. See [container build instructions](docs/containers.md).

## Configuration and operation

See [runtime configuration](docs/configuration.md) for environment variables, email setup, and persistence details.

The application currently has no built-in HTTP authentication, and login passwords and TOTP secrets are stored unencrypted in SQLite. Use a trusted environment or an authenticated access layer and restrict access to the database.
