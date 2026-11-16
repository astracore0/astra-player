#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
export PORT="${PORT:-3000}"

exec node server.js
