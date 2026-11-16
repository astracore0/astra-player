#!/usr/bin/env bash
# Astra Player setup: Termux (Android), Linux (Debian/Ubuntu, Fedora, Arch, Alpine), GitHub Codespaces, macOS, WSL.
#
#   bash setup.sh                     full setup: Node, ffmpeg, app, whisper.cpp + models (AI subtitles)
#   bash setup.sh --no-whisper        skip whisper.cpp (no AI subtitles, much faster)
#   bash setup.sh --media /path       set the media folder
#   bash setup.sh --port 3000         remember the port (written to start.sh)
#   bash setup.sh --dry-run           show what would be done, change nothing
#   bash setup.sh --help
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHISPER=1; MEDIA=""; PORT="3000"; DRY=0; WHISPER_MODEL="base"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --whisper) WHISPER=1 ;;
    --no-whisper) WHISPER=0 ;;
    --media) shift; MEDIA="${1:-}" ;;
    --port) shift; PORT="${1:-3000}" ;;
    --model) shift; WHISPER_MODEL="${1:-base}" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------- detect the system
OS="linux"; PM=""; ENVNAME="Linux"
if [ -n "${PREFIX:-}" ] && [ -d "${PREFIX}/bin" ] && printf '%s' "$PREFIX" | grep -q "com.termux"; then
  OS="termux"; PM="pkg"; ENVNAME="Termux (Android)"
elif [ "$(uname -s)" = "Darwin" ]; then
  OS="macos"; PM="brew"; ENVNAME="macOS"
elif uname -s | grep -qiE 'mingw|msys|cygwin'; then
  OS="windows"; ENVNAME="Windows (Git Bash)"
else
  if [ -f /etc/os-release ]; then . /etc/os-release; fi
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*ubuntu*) PM="apt" ;;
    *fedora*|*rhel*|*centos*) PM="dnf" ;;
    *arch*) PM="pacman" ;;
    *alpine*) PM="apk" ;;
    *suse*) PM="zypper" ;;
  esac
  ENVNAME="Linux (${PRETTY_NAME:-unknown})"
  [ "${CODESPACES:-}" = "true" ] && ENVNAME="GitHub Codespaces"
  grep -qi microsoft /proc/version 2>/dev/null && ENVNAME="$ENVNAME, WSL"
fi
say "System: $ENVNAME"

if [ "$OS" = "windows" ]; then
  warn "Native Windows is not supported by this script."
  echo "   Easiest: install WSL (wsl --install in PowerShell), open Ubuntu, run this script there."
  echo "   Or install Node.js LTS + ffmpeg (winget install OpenJS.NodeJS.LTS Gyan.FFmpeg), then run: npm install && node server.js"
  exit 1
fi

SUDO=""
if [ "$OS" != "termux" ] && [ "$(id -u)" != "0" ]; then
  if have sudo; then SUDO="sudo"; else warn "not root and no sudo: package installs may fail"; fi
fi

pkg_install() {   # pkg_install <names for this package manager...>
  case "$PM" in
    pkg)    run pkg install -y "$@" ;;
    apt)    run $SUDO apt-get update -y >/dev/null 2>&1; run $SUDO apt-get install -y "$@" ;;
    dnf)    run $SUDO dnf install -y "$@" ;;
    pacman) run $SUDO pacman -S --noconfirm --needed "$@" ;;
    apk)    run $SUDO apk add "$@" ;;
    zypper) run $SUDO zypper install -y "$@" ;;
    brew)   run brew install "$@" ;;
    *)      return 1 ;;
  esac
}

[ -n "$PM" ] || die "unknown package manager. Install manually: Node.js 18+, ffmpeg, git, then run: npm install"
[ "$OS" = "macos" ] && ! have brew && die "Homebrew is needed first: https://brew.sh"

# ---------------------------------------------------------------- base tools
say "Installing Node.js, ffmpeg and git"
case "$PM" in
  pkg)    pkg_install nodejs ffmpeg git ;;
  apt)    pkg_install nodejs npm ffmpeg git curl ca-certificates ;;
  dnf)    pkg_install nodejs npm ffmpeg-free git curl || pkg_install nodejs npm ffmpeg git curl ;;
  pacman) pkg_install nodejs npm ffmpeg git curl ;;
  apk)    pkg_install nodejs npm ffmpeg git curl ;;
  zypper) pkg_install nodejs npm ffmpeg git curl ;;
  brew)   pkg_install node ffmpeg git ;;
esac

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$DRY" != 1 ]; then
  if ! have node || [ "$(node_major)" -lt 18 ]; then
    warn "Node.js 18+ is required (found: $(node -v 2>/dev/null || echo none)). Trying nvm..."
    if have curl; then
      export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      # shellcheck disable=SC1091
      . "$NVM_DIR/nvm.sh" && nvm install --lts
    fi
    have node && [ "$(node_major)" -ge 18 ] || die "could not get Node.js 18+. Install it from https://nodejs.org and run this script again."
  fi
  have ffmpeg  || die "ffmpeg is not installed"
  have ffprobe || die "ffprobe is not installed (it comes with ffmpeg)"
  ok "node $(node -v), $(ffmpeg -version | head -n1 | cut -d' ' -f1-3)"
fi

# ---------------------------------------------------------------- app dependencies
say "Installing app dependencies"
if [ -f "$DIR/package.json" ]; then
  (cd "$DIR" && run npm install --omit=dev --no-audit --no-fund) || die "npm install failed"
else
  die "package.json not found next to setup.sh ($DIR)"
fi

# ---------------------------------------------------------------- media folder
if [ -z "$MEDIA" ]; then
  case "$OS" in
    termux)
      if [ ! -d "$HOME/storage/shared" ]; then
        warn "Android storage is not linked yet. Running termux-setup-storage (allow the permission popup)."
        have termux-setup-storage && run termux-setup-storage
        sleep 2
      fi
      for c in "$HOME/storage/shared/anime" "$HOME/storage/shared/Anime" /sdcard/anime /sdcard/.anime /sdcard; do
        [ -d "$c" ] && MEDIA="$c" && break
      done ;;
    *)
      for c in "$HOME/Videos/anime" "$HOME/Videos" "$HOME/anime" "$HOME/Movies" "/workspaces/media"; do
        [ -d "$c" ] && MEDIA="$c" && break
      done
      if [ -z "$MEDIA" ]; then MEDIA="$HOME/anime"; run mkdir -p "$MEDIA"; warn "created $MEDIA - put your videos there"; fi ;;
  esac
fi
if [ -n "$MEDIA" ] && [ "$DRY" != 1 ]; then
  if [ -d "$MEDIA" ]; then
    MEDIA_PATH="$MEDIA" node -e '
      const fs=require("fs"),f=process.argv[1];let c={};try{c=JSON.parse(fs.readFileSync(f,"utf8"))||{}}catch(e){}
      c.mediaRoot=process.env.MEDIA_PATH;fs.writeFileSync(f,JSON.stringify(c,null,2));' "$DIR/config.json"
    ok "media folder: $MEDIA"
  else
    warn "media folder $MEDIA does not exist; set it later in the app or with --media"
  fi
fi

# ---------------------------------------------------------------- whisper.cpp (optional)
if [ "$WHISPER" = 1 ]; then
  say "Building whisper.cpp for AI subtitles (this takes a few minutes)"
  case "$PM" in
    pkg)    pkg_install cmake clang make ;;
    apt)    pkg_install build-essential cmake ;;
    dnf)    pkg_install gcc-c++ make cmake ;;
    pacman) pkg_install base-devel cmake ;;
    apk)    pkg_install build-base cmake ;;
    zypper) pkg_install gcc-c++ make cmake ;;
    brew)   pkg_install cmake ;;
  esac
  W="$HOME/whisper.cpp"
  [ -d "$W" ] || run git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$W"
  if [ "$DRY" != 1 ] && [ -d "$W" ]; then
    cd "$W" || die "cannot enter $W"
    JOBS=2; [ "$(nproc 2>/dev/null || echo 2)" -ge 6 ] && JOBS=4
    sh ./models/download-ggml-model.sh tiny || warn "tiny model download failed"
    [ "$WHISPER_MODEL" != "tiny" ] && { sh ./models/download-ggml-model.sh "$WHISPER_MODEL" || warn "$WHISPER_MODEL model download failed"; }
    sh ./models/download-vad-model.sh silero-v5.1.2 2>/dev/null || warn "VAD model download failed (optional)"
    build_whisper() { cmake -B build >/dev/null && cmake --build build -j"$JOBS" --target whisper-cli --config Release; }
    if ! build_whisper; then
      # 32-bit ARM (armv7): known duplicate-definition error; patch the header and build again
      if [ "$(uname -m)" = "armv7l" ] || [ "$(uname -m)" = "armv8l" ]; then
        warn "build failed on 32-bit ARM, applying the vcvtnq patch and retrying"
        sed -i '/inline static int32x4_t vcvtnq_s32_f32/,/^}/d' ggml/src/ggml-cpu/ggml-cpu-impl.h 2>/dev/null
        build_whisper
      fi
    fi
    if [ -x "$W/build/bin/whisper-cli" ]; then ok "whisper-cli built: $W/build/bin/whisper-cli"
    else warn "whisper.cpp build failed - Astra still works, only AI subtitles are off"; fi
    cd "$DIR" || true
  fi
else
  say "Skipping whisper.cpp (AI subtitles off). Run  bash setup.sh  again without --no-whisper to add them"
fi

# ---------------------------------------------------------------- start script
if [ "$DRY" != 1 ]; then
  cat > "$DIR/start.sh" <<EOF
#!/usr/bin/env bash
cd "\$(dirname "\$0")" || exit 1
export PORT="\${PORT:-$PORT}"
$( [ "$OS" = "termux" ] && echo 'command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock' )
exec node server.js
EOF
  chmod +x "$DIR/start.sh"
fi

# ---------------------------------------------------------------- check what is in place
if [ "$DRY" != 1 ]; then
  say "Checking the install"
  chk() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else warn "$1 - MISSING"; fi; }
  chk "node $(node -v 2>/dev/null)"        "have node"
  chk "ffmpeg + ffprobe"                    "have ffmpeg && have ffprobe"
  chk "express (npm dependencies)"          "[ -d '$DIR/node_modules/express' ]"
  chk "media folder ${MEDIA:-(not set)}"    "[ -n '$MEDIA' ] && [ -d '$MEDIA' ]"
  if [ "$WHISPER" = 1 ]; then
    chk "whisper-cli"                       "[ -x '$HOME/whisper.cpp/build/bin/whisper-cli' ] || have whisper-cli"
    chk "model ggml-tiny.bin"               "[ -f '$HOME/whisper.cpp/models/ggml-tiny.bin' ]"
    chk "model ggml-$WHISPER_MODEL.bin"     "[ -f '$HOME/whisper.cpp/models/ggml-$WHISPER_MODEL.bin' ]"
    chk "voice-detection model (optional)"  "ls '$HOME'/whisper.cpp/models/ggml-silero*.bin"
  fi
fi

# ---------------------------------------------------------------- done
IP=""
if have hostname; then IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; fi
[ -z "$IP" ] && have ifconfig && IP="$(ifconfig 2>/dev/null | awk '/inet / && $2!="127.0.0.1"{print $2; exit}')"
echo
ok "Setup finished."
echo "   Start:   bash start.sh        (or: node server.js)"
echo "   Open:    http://localhost:$PORT"
[ -n "$IP" ] && echo "   Other devices on the same Wi-Fi: http://$IP:$PORT"
[ "${CODESPACES:-}" = "true" ] && echo "   Codespaces: open the Ports tab, forward port $PORT, and open the forwarded address."
echo "   There is no login: keep the address on your own network."
