package main

import (
	"context"
	"net/http"
	"github.com/go-redis/redis/v8"
)

var rdb = redis.NewClient(&redis.Options{Addr: "redis:6379"})

func checkHandler(w http.ResponseWriter, r *http.Request) {
	// Caddy передает IP в этом заголовке
	clientIP := r.Header.Get("X-Real-IP")

	// Проверяем в Redis
	exists, _ := rdb.Exists(context.Background(), "ban:"+clientIP).Result()

	if exists > 0 {
		w.WriteHeader(http.StatusForbidden) // 403
		return
	}
	w.WriteHeader(http.StatusOK) // 200
}

func main() {
	http.HandleFunc("/check", checkHandler)
	http.ListenAndServe(":5000", nil)
}
