#!/bin/bash
WAF_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

case "$1" in
    start)
        echo "🚀 Запуск стека..."
        sudo systemctl start redis postgresql
        
        # Запуск Go
        cd "$WAF_DIR/waf" && go run main.go > "$WAF_DIR/go_waf.log" 2>&1 &
        
        # Запуск FastAPI
        cd "$WAF_DIR/backend" && python -m uvicorn main:app --port 8000 > "$WAF_DIR/fastapi.log" 2>&1 &
        
        # Запуск Caddy (ОБЯЗАТЕЛЬНО через sudo для порта 80)
        cd "$WAF_DIR/caddy" && sudo caddy start --config Caddyfile
        
        echo "⏳ Ожидание запуска (3 сек)..."
        sleep 3
        
        echo "📊 Проверка портов:"
        sudo ss -tulpn | grep -E "80|5000|8000"
        ;;
        
    stop)
        echo "🛑 Остановка..."
        pkill -f "go run main.go"
        pkill -f "uvicorn main:app"
        sudo caddy stop
        echo "✅ Готово."
        ;;

    clear)
        echo "🧹 Очистка..."
        redis-cli flushall
        sudo -u postgres psql -d waf_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
        rm -f *.log waf-go/*.log backend/*.log
        echo "✅ Базы и логи очищены."
        ;;
esac
