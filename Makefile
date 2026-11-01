IMAGE := sgp.vultrcr.com/695w/swissy:latest

.PHONY: run build image push docker-run tidy clean

tidy:
	go mod tidy

run:
	mkdir -p ./data
	SWISSY_DB=./data/swissy.db SMTP_ADDR=:2525 go run ./cmd/swissy

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/swissy ./cmd/swissy

image:
	docker build --platform linux/amd64 -t $(IMAGE) .

push: image
	docker push $(IMAGE)

docker-run: image
	mkdir -p ./data
	docker run --rm \
	  --user "$$(id -u):$$(id -g)" \
	  -p 8080:8080 -p 25:25 \
	  -v "$(CURDIR)/data:/data" \
	  --env-file ./.env \
	  $(IMAGE)

clean:
	rm -rf bin data
