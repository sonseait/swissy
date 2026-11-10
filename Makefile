.PHONY: run build tidy

tidy:
	go mod tidy

run:
	mkdir -p ./data
	SWISSY_DB=./data/swissy.db SMTP_ADDR=:2525 go run ./cmd

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/swissy ./cmd
