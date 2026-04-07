#!/bin/sh

set -eu

if command -v bun >/dev/null 2>&1; then
  exec bun scripts/cli.ts "$@"
fi

exec node --import tsx scripts/cli.ts "$@"
