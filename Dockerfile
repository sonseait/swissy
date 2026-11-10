FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/swissy ./cmd
RUN mkdir -p /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/swissy /swissy
COPY --from=build --chown=nonroot:nonroot /out/data /data
VOLUME ["/data"]
EXPOSE 8080 25
ENV SWISSY_DB=/data/swissy.db \
    HTTP_ADDR=:8080 \
    SMTP_ADDR=:25
USER nonroot:nonroot
ENTRYPOINT ["/swissy"]
