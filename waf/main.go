package main

import (
	"context"
	"fmt"
	"net/http"

	"github.com/go-redis/redis/v8"
)

var rdb = redis.NewClient(&redis.Options{Addr: "localhost:6379"})

func checkHandler(w http.ResponseWriter, r *http.Request) {

	clientIP := r.Header.Get("X-Real-IP")

	fmt.Printf("🔎 Проверка IP: [%s]\n", clientIP)
	exists, _ := rdb.Exists(context.Background(), "ban:"+clientIP).Result()

	if exists > 0 {
		fmt.Printf("🚫 БЛОКИРОВКА: %s\n", clientIP)
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func main() {
	fmt.Println("🚀 Go WAF Detector запущен на порту :5000")
	http.HandleFunc("/check", checkHandler)
	// Запускаем сервер
	if err := http.ListenAndServe(":5000", nil); err != nil {
		fmt.Printf("🛑 Ошибка: %v\n", err)
	}
}
