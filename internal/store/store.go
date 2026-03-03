package store

import (
	"database/sql"
	"net"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type LogEntry struct {
	ID        int64     `json:"id"`
	IP        string    `json:"ip"`
	Method    string    `json:"method"`
	Path      string    `json:"path"`
	Status    int       `json:"status"`
	LatencyMs int64     `json:"latency_ms"`
	Ts        time.Time `json:"ts"`
}

type Assignment struct {
	Floor int    `json:"floor"`
	Edge  int    `json:"edge"`
	IP    string `json:"ip"`
	Label string `json:"label"`
}

type FloorEdge struct {
	Floor int
	Edge  int
}

type Store struct {
	db        *sql.DB
	mu        sync.RWMutex
	cache     map[string]FloorEdge
	cidrCache []cidrAssignment
}

type cidrAssignment struct {
	net *net.IPNet
	fe  FloorEdge
}

func New(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	s := &Store{db: db, cache: make(map[string]FloorEdge), cidrCache: []cidrAssignment{}}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	if err := s.loadCache(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS logs (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			ip         TEXT NOT NULL,
			method     TEXT NOT NULL,
			path       TEXT NOT NULL,
			status     INTEGER NOT NULL,
			latency_ms INTEGER NOT NULL,
			ts         DATETIME NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ip_assignments (
			floor INTEGER NOT NULL,
			edge  INTEGER NOT NULL,
			ip    TEXT NOT NULL,
			label TEXT NOT NULL DEFAULT '',
			PRIMARY KEY (floor, edge, ip)
		);
		CREATE TABLE IF NOT EXISTS config (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		INSERT OR IGNORE INTO config (key, value) VALUES
			('proxy_target',  'http://localhost:3000'),
			('proxy_listen',  ':8080'),
			('proxy_routes',  ''),
			('admin_listen',  ':9090'),
			('ip_pools',      '[]'),
			('services',      '[]');
	`)
	return err
}

func (s *Store) loadCache() error {
	rows, err := s.db.Query(`SELECT floor, edge, ip FROM ip_assignments`)
	if err != nil {
		return err
	}
	defer rows.Close()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache = make(map[string]FloorEdge)
	s.cidrCache = []cidrAssignment{}
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.Floor, &a.Edge, &a.IP); err != nil {
			return err
		}
		s.upsertCache(a)
	}
	return rows.Err()
}

func (s *Store) upsertCache(a Assignment) {
	if _, n, err := net.ParseCIDR(a.IP); err == nil {
		for i, existing := range s.cidrCache {
			if existing.net.String() == n.String() {
				s.cidrCache[i] = cidrAssignment{net: n, fe: FloorEdge{Floor: a.Floor, Edge: a.Edge}}
				return
			}
		}
		s.cidrCache = append(s.cidrCache, cidrAssignment{net: n, fe: FloorEdge{Floor: a.Floor, Edge: a.Edge}})
		return
	}
	s.cache[a.IP] = FloorEdge{Floor: a.Floor, Edge: a.Edge}
}

func (s *Store) GetFloorEdge(ip string) (FloorEdge, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	fe, ok := s.cache[ip]
	if ok {
		return fe, true
	}
	parsed := net.ParseIP(ip)
	if parsed != nil {
		for _, entry := range s.cidrCache {
			if entry.net.Contains(parsed) {
				return entry.fe, true
			}
		}
	}
	return fe, ok
}

func (s *Store) SaveLog(e LogEntry) error {
	_, err := s.db.Exec(
		`INSERT INTO logs (ip, method, path, status, latency_ms, ts) VALUES (?,?,?,?,?,?)`,
		e.IP, e.Method, e.Path, e.Status, e.LatencyMs, e.Ts.UTC(),
	)
	return err
}

func (s *Store) GetLogs(limit int) ([]LogEntry, error) {
	rows, err := s.db.Query(
		`SELECT id, ip, method, path, status, latency_ms, ts FROM logs ORDER BY id DESC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []LogEntry
	for rows.Next() {
		var e LogEntry
		if err := rows.Scan(&e.ID, &e.IP, &e.Method, &e.Path, &e.Status, &e.LatencyMs, &e.Ts); err != nil {
			return nil, err
		}
		logs = append(logs, e)
	}
	return logs, rows.Err()
}

func (s *Store) GetAssignments() ([]Assignment, error) {
	rows, err := s.db.Query(`SELECT floor, edge, ip, label FROM ip_assignments ORDER BY floor, edge, ip`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Assignment
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.Floor, &a.Edge, &a.IP, &a.Label); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

func (s *Store) AddAssignment(a Assignment) error {
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO ip_assignments (floor, edge, ip, label) VALUES (?,?,?,?)`,
		a.Floor, a.Edge, a.IP, a.Label,
	)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.upsertCache(a)
	s.mu.Unlock()
	return nil
}

func (s *Store) DeleteAssignment(floor, edge int, ip string) error {
	_, err := s.db.Exec(
		`DELETE FROM ip_assignments WHERE floor=? AND edge=? AND ip=?`, floor, edge, ip,
	)
	if err != nil {
		return err
	}
	s.mu.Lock()
	delete(s.cache, ip)
	if _, n, err := net.ParseCIDR(ip); err == nil {
		filtered := make([]cidrAssignment, 0, len(s.cidrCache))
		for _, entry := range s.cidrCache {
			if entry.net.String() != n.String() {
				filtered = append(filtered, entry)
			}
		}
		s.cidrCache = filtered
	}
	s.mu.Unlock()
	return nil
}

func (s *Store) GetConfig(key string) (string, error) {
	var val string
	err := s.db.QueryRow(`SELECT value FROM config WHERE key=?`, key).Scan(&val)
	return val, err
}

func (s *Store) SetConfig(key, value string) error {
	_, err := s.db.Exec(`INSERT OR REPLACE INTO config (key, value) VALUES (?,?)`, key, value)
	return err
}

func (s *Store) GetAllConfig() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM config`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		m[k] = v
	}
	return m, rows.Err()
}

func (s *Store) GetStats() (map[string]int, error) {
	since := time.Now().Add(-time.Hour).UTC()
	rows, err := s.db.Query(
		`SELECT ip, COUNT(*) FROM logs WHERE ts > ? GROUP BY ip`, since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int)
	for rows.Next() {
		var ip string
		var cnt int
		if err := rows.Scan(&ip, &cnt); err != nil {
			return nil, err
		}
		m[ip] = cnt
	}
	return m, rows.Err()
}
