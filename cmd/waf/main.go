package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"academ_waf/internal/api"
	"academ_waf/internal/hub"
	"academ_waf/internal/proxy"
	"academ_waf/internal/store"
)

func getEnvOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	dbPath := getEnvOr("WAF_DB", "/data/waf.db")
	webDir := getEnvOr("WAF_WEB", "/app/web")

	s, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}

	h := hub.New()

	proxyListen, _ := s.GetConfig("proxy_listen")
	adminListen, _ := s.GetConfig("admin_listen")
	if proxyListen == "" {
		proxyListen = ":8080"
	}
	if adminListen == "" {
		adminListen = ":9090"
	}

	p := proxy.New(s, h)
	a := api.New(s, h, webDir)

	fmt.Printf("WAF proxy   → http://0.0.0.0%s\n", proxyListen)
	fmt.Printf("Admin UI    → http://0.0.0.0%s\n", adminListen)

	errCh := make(chan error, 2)

	go func() {
		if err := http.ListenAndServe(proxyListen, p); err != nil {
			errCh <- fmt.Errorf("proxy: %w", err)
		}
	}()

	go func() {
		if err := http.ListenAndServe(adminListen, a.Handler()); err != nil {
			errCh <- fmt.Errorf("admin: %w", err)
		}
	}()

	log.Fatal(<-errCh)
}
