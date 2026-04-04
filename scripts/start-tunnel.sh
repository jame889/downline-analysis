#!/bin/bash
# start-tunnel.sh — รัน Cloudflare tunnel แล้วอัปเดต Vercel OLLAMA_URL อัตโนมัติ

set -e

CLOUDFLARED=/tmp/cloudflared
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/tmp/ollama-tunnel.log
PID_FILE=/tmp/ollama-tunnel.pid

# ── 0. ตรวจ cloudflared ────────────────────────────────────────────────────────
if [ ! -f "$CLOUDFLARED" ]; then
  echo "📥 กำลังดาวน์โหลด cloudflared..."
  curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" \
    | tar -xz -C /tmp/
  chmod +x "$CLOUDFLARED"
fi

# ── 1. หยุด tunnel เดิม (ถ้ามี) ───────────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "🛑 หยุด tunnel เดิม (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# ── 2. รัน tunnel ใหม่ ─────────────────────────────────────────────────────────
echo "🚇 กำลังเริ่ม Cloudflare tunnel → localhost:11434..."
"$CLOUDFLARED" tunnel --url http://localhost:11434 --no-autoupdate > "$LOG" 2>&1 &
TUNNEL_PID=$!
echo $TUNNEL_PID > "$PID_FILE"

# ── 3. รอ URL ออกมา ────────────────────────────────────────────────────────────
echo "⏳ รอ URL จาก Cloudflare..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ ไม่พบ URL จาก tunnel — ดู log ที่ $LOG"
  exit 1
fi

echo "✅ Tunnel URL: $TUNNEL_URL"

# ── 4. อัปเดต OLLAMA_URL บน Vercel ───────────────────────────────────────────
cd "$PROJECT_DIR"
echo "☁️  อัปเดต OLLAMA_URL บน Vercel..."

# ลบ env เดิม แล้วสร้างใหม่
PATH="/usr/local/bin:$PATH" npx --yes vercel env rm OLLAMA_URL production --yes 2>/dev/null || true
echo "$TUNNEL_URL" | PATH="/usr/local/bin:$PATH" npx vercel env add OLLAMA_URL production 2>/dev/null

echo "🚀 Redeploy Vercel..."
PATH="/usr/local/bin:$PATH" npx vercel deploy --prod --yes 2>&1 | grep -E "Ready|Error|https://" | tail -5

echo ""
echo "✅ เสร็จแล้ว!"
echo "   Tunnel  : $TUNNEL_URL"
echo "   PID     : $TUNNEL_PID (ดู log: tail -f $LOG)"
echo "   หยุด    : kill \$(cat $PID_FILE)"
