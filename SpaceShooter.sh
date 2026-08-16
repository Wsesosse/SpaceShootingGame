#!/bin/bash

cd "$(dirname "$0")" || exit 1

npm install

mkdir -p dist

npm run build

IS_SERVER_RUNNING=$(lsof -i :8050)

if lsof -i :8050 >/dev/null 2>&1; then
    echo "Server already running"
else
    echo "Starting server..."
    nohup python3 -m http.server 8050 --directory "$PWD" >/dev/null 2>&1 &
fi

xdg-open "http://localhost:8050/"