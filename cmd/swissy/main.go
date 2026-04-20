package main

import (
	"log"
	"net/http"

	"swissy/internal/config"
	"swissy/internal/httpapi"
	"swissy/internal/hub"
	"swissy/internal/s3"
	"swissy/internal/smtpsrv"
	"swissy/internal/store"
)

func main() {
	dbPath := config.Env("SWISSY_DB", "/data/swissy.db")
	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	s3c, err := s3.NewFromEnv()
	if err != nil {
		log.Printf("S3 disabled: %v", err)
	}

	h := hub.New()

	smtpServer := &smtpsrv.Server{
		Addr:   config.Env("SMTP_ADDR", ":25"),
		Domain: config.Env("SMTP_HOSTNAME", "swissy.local"),
		Store:  st,
		S3:     s3c,
		Hub:    h,
	}
	go smtpServer.ListenAndServe()

	api := &httpapi.Server{Store: st, Hub: h, S3: s3c}
	httpAddr := config.Env("HTTP_ADDR", ":8080")
	log.Printf("http listening on %s", httpAddr)
	log.Fatal(http.ListenAndServe(httpAddr, api.Handler()))
}
