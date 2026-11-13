#!/usr/bin/env bash
# Astra Player universal setup (Android Termux, Linux, Codespaces, macOS, WSL)
# Usage:
#   bash setup.sh               # Install Node.js, ffmpeg & app dependencies
#   bash setup.sh --whisper     # Also build whisper.cpp + tiny/base models + Silero VAD
#   bash setup.sh --media /path # Set default media folder
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHISPER=0; MEDIA=""; PORT="3000"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --whisper) WHISPER=1 ;;
    --media)   shift; MEDIA="${1:-}" ;;
    --port)    shift; PORT="${1:-3000}" ;;
    *) die "Unknown flag: $1" ;;
  esac
  shift
done

OS="linux"; PM=""
if [ -n "${PREFIX:-}" ] && printf '%s' "$PREFIX" | grep -q "com.termux"; then
  OS="termux"; PM="pkg"
elif [ "$(uname -s)" = "Darwin" ]; then
  OS="macos"; PM="brew"
else
  [ -f /etc/os-release ] && . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*ubuntu*) PM="apt" ;;
    *fedora*|*rhel*)   PM="dnf" ;;
    *arch*)            PM="pacman" ;;
    *alpine*)          PM="apk" ;;
  esac
fi

SUDO=""; [ "$OS" != "termux" ] && [ "$(id -u)" != "0" ] && have sudo && SUDO="sudo"

say "Installing Node.js, FFmpeg, and Git ($OS)"
case "$PM" in
  pkg)    pkg update -y && pkg upgrade -y libicu 2>/dev/null || true; pkg install -y nodejs ffmpeg git ;;
  apt)    $SUDO apt-get update -y && $SUDO apt-get install -y nodejs npm ffmpeg git curl build-essential cmake ;;
  dnf)    $SUDO dnf install -y nodejs npm ffmpeg git curl gcc-c++ make cmake ;;
  pacman) $SUDO pacman -S --noconfirm --needed nodejs npm ffmpeg git curl base-devel cmake ;;
  apk)    $SUDO apk add nodejs npm ffmpeg git curl build-base cmake ;;
  brew)   brew install node ffmpeg git cmake ;;
  *)      die "Unsupported OS. Install Node.js 18+, ffmpeg, and git manually." ;;
esac

if [ ! -f "$DIR/package.json" ]; then
  cat > "$DIR/package.json" <<'PKG'
{
  "name": "astra-player",
  "version": "1.15.3",
  "private": true,
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.21.2" }
}
PKG
fi

NPM_FLAGS="--omit=dev --no-audit --no-fund"
case "$DIR" in
  /sdcard*|/storage/*)
    NPM_FLAGS="$NPM_FLAGS --no-bin-links"
    [ -d "$DIR/node_modules" ] && [ ! -d "$DIR/node_modules/express" ] && rm -rf "$DIR/node_modules"
    ;;
esac
(cd "$DIR" && npm install $NPM_FLAGS) || die "npm install failed"
ok "Node dependencies installed"

if [ -z "$MEDIA" ]; then
  if [ "$OS" = "termux" ]; then
    [ -d "$HOME/storage/shared" ] || termux-setup-storage 2>/dev/null || true
    for c in "$HOME/storage/shared/anime" /sdcard/anime /sdcard/Anime /sdcard/.Anime /sdcard; do
      [ -d "$c" ] && MEDIA="$c" && break
    done
  else
    for c in "$DIR/media" "$HOME/Videos" "$HOME/anime"; do
      [ -d "$c" ] && MEDIA="$c" && break
    done
    [ -z "$MEDIA" ] && MEDIA="$DIR/media" && mkdir -p "$MEDIA"
  fi
fi

if [ -n "$MEDIA" ] && [ -d "$MEDIA" ]; then
  MEDIA_PATH="$MEDIA" node -e '
    const fs=require("fs"), f=process.argv[1];
    let c={}; try{c=JSON.parse(fs.readFileSync(f,"utf8"))||{}}catch(e){}
    c.mediaRoot=process.env.MEDIA_PATH; fs.writeFileSync(f,JSON.stringify(c,null,2));
  ' "$DIR/config.json"
  ok "Media root set to: $MEDIA"
fi

if [ "$WHISPER" = 1 ]; then
  say "Setting up whisper.cpp + models..."
  [ "$PM" = "pkg" ] && pkg install -y cmake clang make
  W="$HOME/whisper.cpp"
  [ -d "$W" ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$W"
  cd "$W" || die "Cannot enter $W"

  if [ "$(uname -m)" = "armv7l" ] || [ "$(uname -m)" = "armv8l" ]; then
    sed -i '/inline static int32x4_t vcvtnq_s32_f32/,/^}/d' ggml/src/ggml-cpu/ggml-cpu-impl.h 2>/dev/null || true
  fi

  MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 4096)
  JOBS=2; [ "$MEM_MB" -lt 3000 ] && JOBS=1; [ "$MEM_MB" -ge 6000 ] && JOBS=4

  sh ./models/download-ggml-model.sh tiny
  sh ./models/download-ggml-model.sh base
  sh ./models/download-vad-model.sh silero-v5.1.2 || true

  cmake -B build && cmake --build build -j"$JOBS" --target whisper-cli --config Release \
    && ok "whisper-cli compiled (-j$JOBS)" || warn "whisper.cpp compile failed"
  cd "$DIR" || true
fi

cat > "$DIR/start.sh" <<START
#!/usr/bin/env bash
cd "\$(dirname "\$0")" || exit 1
export PORT="\${PORT:-$PORT}"
$( [ "$OS" = "termux" ] && echo 'command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock' )
exec node server.js
START
chmod +x "$DIR/start.sh"
ok "Setup complete! Run: bash start.sh"
