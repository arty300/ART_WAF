# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go mod tidy && go mod verify
RUN CGO_ENABLED=0 GOOS=linux go build -o /waf ./cmd/waf

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /waf ./waf
COPY web/ ./web/

# SQLite database lives on a mounted volume
VOLUME ["/data"]

ENV WAF_DB=/data/waf.db
ENV WAF_WEB=/app/web

EXPOSE 8080 9090

ENTRYPOINT ["/app/waf"]
