package proxy

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"academ_waf/internal/hub"
	"academ_waf/internal/store"
)

type Proxy struct {
	store *store.Store
	hub   *hub.Hub
}

func New(s *store.Store, h *hub.Hub) *Proxy {
	return &Proxy{store: s, hub: h}
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target, err := p.store.GetConfig("proxy_target")
	if err != nil || target == "" {
		http.Error(w, "proxy target not configured", http.StatusBadGateway)
		return
	}

	targetURL, err := url.Parse(target)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid proxy target: %v", err), http.StatusBadGateway)
		return
	}

	clientIP := extractIP(r)
	start := time.Now()

	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = targetURL.Scheme
			req.URL.Host = targetURL.Host
			req.Host = targetURL.Host
			if _, ok := req.Header["User-Agent"]; !ok {
				req.Header.Set("User-Agent", "")
			}
			req.Header.Set("X-Forwarded-For", clientIP)
			req.Header.Set("X-Real-IP", clientIP)
		},
	}

	rec := &statusRecorder{ResponseWriter: w, status: 200}
	rp.ServeHTTP(rec, r)

	latency := time.Since(start).Milliseconds()

	entry := store.LogEntry{
		IP:        clientIP,
		Method:    r.Method,
		Path:      r.URL.Path,
		Status:    rec.status,
		LatencyMs: latency,
		Ts:        time.Now(),
	}
	_ = p.store.SaveLog(entry)

	fe, ok := p.store.GetFloorEdge(clientIP)
	ev := hub.Event{
		IP:        clientIP,
		Floor:     -1,
		Edge:      -1,
		Method:    r.Method,
		Path:      r.URL.Path,
		Status:    rec.status,
		LatencyMs: latency,
		Ts:        time.Now().UTC().Format(time.RFC3339),
	}
	if ok {
		ev.Floor = fe.Floor
		ev.Edge = fe.Edge
	}
	p.hub.Broadcast(ev)
}

func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
