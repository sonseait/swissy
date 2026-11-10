# Runtime configuration

Swissy reads runtime settings from process environment variables. It does not automatically load `.env` files. Supply private settings through an ignored local env file or your deployment environment.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SWISSY_DB` | `/data/swissy.db` | SQLite database path; its parent directory must exist and be writable. |
| `HTTP_ADDR` | `:8080` | Listen address for the web UI and HTTP API. |
| `SMTP_ADDR` | `:25` | Listen address for inbound SMTP. Use an unprivileged port for local development. |
| `SMTP_HOSTNAME` | `swissy.local` | Hostname advertised by the SMTP server. |
| `S3_ENDPOINT` | Empty | S3-compatible endpoint in `host:port` form, without a URL scheme. |
| `S3_BUCKET` | Empty | Existing bucket for raw `.eml` messages. |
| `S3_ACCESS_KEY` | Empty | Object storage access key. |
| `S3_SECRET_KEY` | Empty | Object storage secret key. |
| `S3_USE_SSL` | `true` | Enable TLS for object storage requests. |
| `S3_REGION` | `us-east-1` | Object storage region. |

`make run` overrides the database path to `./data/swissy.db` and SMTP address to `:2525`.
The registry, project, and platform in `build/.env` control container builds; the image name is fixed as `swissy:latest`. These settings are separate from runtime configuration. See [container configuration](containers.md).

## Receiving email

Add a domain and create a mailbox in the Mails interface before sending messages to it. The SMTP receiver accepts recipients only when their mailboxes exist. For Internet delivery, configure the domain's MX record and the mail host's address record, and make the SMTP listener reachable on port 25.

Set the S3 variables and provide an existing bucket with read/write access to retain raw email. Without S3, messages still produce metadata and live inbox events, but their bodies are not stored and the raw email endpoint returns HTTP 503.

## Persistence

SQLite stores TOTP secrets, login records, domains, mailboxes, email metadata, pastes, and webhook events. Back up the database and the object storage bucket if you need to preserve the full inbox. Browser-local preferences and Markdown drafts remain in the browser's storage.

For containers, mount writable persistent storage at `/data` for the non-root container user. The Compose file in `build/` configures image builds only; it does not publish service ports or configure runtime persistence.
