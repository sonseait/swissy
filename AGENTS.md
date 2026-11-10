# Working rules

## Go

- Use the existing `net/http`, SQLite, SMTP, and S3 facilities; reuse handlers, store methods, and helpers before adding dependencies.
- Format changed Go files with `gofmt`. Use lowercase package names and lowercase underscore-separated filenames; follow Go initialisms such as `ID`, `HTTP`, and `URL`.
- Group imports as standard library, external dependencies, then `swissy/...`, separated by blank lines.
- Use self-explanatory names and cohesive functions. Avoid duplicated logic, speculative interfaces, and unnecessary wrappers.
- Return errors from reusable code; add operation context with `%w` when wrapping. Keep fatal logging at application startup boundaries.
- Pass request contexts to database and object storage operations. Validate HTTP methods, identifiers, payload sizes, and decoded inputs before side effects.
- Close SQL rows and check `rows.Err()`. Release resources with `defer`; stop timers and unsubscribe SSE listeners when their requests end.
- Keep SQL values parameterized. Coordinate schema changes with existing SQLite data and preserve API field names unless changing the contract deliberately.
- Comment non-obvious constraints and decisions; omit comments that restate code. Preserve legal notices and tooling directives such as `//go:embed`.

## Embedded frontend

- Keep plain HTML, CSS, and JavaScript without a separate frontend build. Preserve script loading order and reuse existing UI helpers.
- Follow two-space JavaScript indentation, camelCase functions/variables, and uppercase constants; keep feature scripts named after their existing routes.
- Use `textContent` or the existing `esc` helper for untrusted text; sanitize user-authored markup before rendering HTML.
- Use semantic controls, associated labels, keyboard access, and visible focus states for UI changes.
- Clean up feature timers, event streams, and editor instances when leaving a view. Do not hand-edit vendored libraries.

## Commands

- Run locally: `make run` (HTTP on port 8080, SMTP on 2525, SQLite at `./data/swissy.db`).
- Build the binary: `make build`. Run `make tidy` only when changing dependencies and review module diffs.
- Check Go changes: `go test ./...` and `go vet ./...`; check every change with `git diff --check`.
- Build containers directly: `docker compose --env-file build/.env -f build/compose.yaml build`; initialize the env file using [container instructions](docs/containers.md).
- Keep Docker commands out of the Makefile. Keep the Dockerfile at the repository root and the image suffix fixed as `swissy:latest`; configure registry/project through `build/.env`.

## Documentation

- Keep product features in [README.md](README.md), runtime settings in [configuration](docs/configuration.md), and container workflows in [container instructions](docs/containers.md) aligned with changes.
