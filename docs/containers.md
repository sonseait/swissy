# Container image configuration

The Dockerfile lives at the repository root; Compose configuration lives in `build/`.
Compose resolves the build context to the repository root.
Create the local env file once, then validate and build:

```sh
cp build/.env.example build/.env
docker compose --env-file build/.env -f build/compose.yaml config --quiet
docker compose --env-file build/.env -f build/compose.yaml build
```

The image reference is `${REGISTRY}/${PROJECT}/swissy:latest`. The image name
`swissy` and tag `latest` are fixed in Compose; only the registry and project
are configurable. Set `REGISTRY` to a registry host (optionally with a port,
without a URL scheme) and `PROJECT` to its namespace in `build/.env`.
The example values are fictitious and must be replaced for publishing.

`BUILD_PLATFORM` defaults to `linux/amd64`. The env file is ignored by Git,
and env files and local data are excluded from the Docker build context.

To build and push, set the destination through your environment:

```sh
docker compose --env-file build/.env -f build/compose.yaml build
docker compose --env-file build/.env -f build/compose.yaml push
```

Configure `REGISTRY` and `PROJECT` and authenticate with your registry first.
Environment variables override values in `build/.env`.

