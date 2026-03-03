package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"academ_waf/internal/api"
	"academ_waf/internal/hub"
	"academ_waf/internal/proxy"
	"academ_waf/internal/store"
)

type proxyRoute struct {
	Listen string `json:"listen"`
	Target string `json:"target"`
}

func getEnvOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	dbPath := resolveDBPath()
	webDir := resolveWebDir()

	if err := ensureDBDir(dbPath); err != nil {
		log.Fatalf("db path: %v", err)
	}

	s, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}

	h := hub.New()

	adminListen, _ := s.GetConfig("admin_listen")
	if adminListen == "" {
		adminListen = ":9090"
	}

	routes := loadProxyRoutes(s)

	a := api.New(s, h, webDir)

	for _, route := range routes {
		fmt.Printf("WAF proxy   %s -> %s\n", route.Listen, route.Target)
	}
	fmt.Printf("Admin UI    → http://0.0.0.0%s\n", adminListen)

	errCh := make(chan error, len(routes)+1)

	for _, route := range routes {
		route := route
		p := proxy.NewWithTarget(s, h, route.Target)
		go func() {
			if err := http.ListenAndServe(route.Listen, p); err != nil {
				errCh <- fmt.Errorf("proxy %s -> %s: %w", route.Listen, route.Target, err)
			}
		}()
	}

	go func() {
		if err := http.ListenAndServe(adminListen, a.Handler()); err != nil {
			errCh <- fmt.Errorf("admin: %w", err)
		}
	}()

	log.Fatal(<-errCh)
}

func resolveDBPath() string {
	if v := os.Getenv("WAF_DB"); v != "" {
		return v
	}
	if _, err := os.Stat("/data"); err == nil {
		return "/data/waf.db"
	}
	return filepath.Join("data", "waf.db")
}

func ensureDBDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}

func resolveWebDir() string {
	if v := os.Getenv("WAF_WEB"); v != "" {
		return v
	}
	if _, err := os.Stat("/app/web"); err == nil {
		return "/app/web"
	}
	return "web"
}

func loadProxyRoutes(s *store.Store) []proxyRoute {
	fallbackListen, _ := s.GetConfig("proxy_listen")
	fallbackTarget, _ := s.GetConfig("proxy_target")
	if fallbackListen == "" {
		fallbackListen = ":8080"
	}
	if fallbackTarget == "" {
		fallbackTarget = "http://localhost:3000"
	}

	raw, _ := s.GetConfig("proxy_routes")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []proxyRoute{{Listen: fallbackListen, Target: fallbackTarget}}
	}

	var routes []proxyRoute
	if err := json.Unmarshal([]byte(raw), &routes); err != nil {
		log.Printf("invalid proxy_routes config, fallback to single route: %v", err)
		return []proxyRoute{{Listen: fallbackListen, Target: fallbackTarget}}
	}

	clean := make([]proxyRoute, 0, len(routes))
	for _, route := range routes {
		listen := strings.TrimSpace(route.Listen)
		target := strings.TrimSpace(route.Target)
		if listen == "" || target == "" {
			continue
		}
		clean = append(clean, proxyRoute{Listen: listen, Target: target})
	}
	if len(clean) == 0 {
		return []proxyRoute{{Listen: fallbackListen, Target: fallbackTarget}}
	}
	return clean
}
