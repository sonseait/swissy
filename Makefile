IMAGE := cr.0xh4ck3d.dev/c/swissy:latest

.PHONY: run build image push tidy clean

tidy:
	go mod tidy

run:
	mkdir -p ./data
	SWISSY_DB=./data/swissy.db SMTP_ADDR=:2525 go run ./cmd/swissy

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/swissy ./cmd/swissy

image:
	docker build -t $(IMAGE) .

push: image
	docker push $(IMAGE)

docker-run: image
	docker run --rm \
	  -p 8080:8080 -p 25:25 \
	  -v $(PWD)/data:/data \
	  --env-file ./.env \
	  $(IMAGE)

clean:
	rm -rf bin data
