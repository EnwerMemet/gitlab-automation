#!/usr/bin/env bash

# Load variables from .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Fallback PARENT_GROUP_ID if missing
export PARENT_GROUP_ID="${PARENT_GROUP_ID:-142584572}"

# Get file argument or default to running all
SCRIPT="${1:-all}"

if [ "$SCRIPT" = "all" ]; then
  for file in tests/*.js; do
    k6 run "$file"
  done
else
  # Runs tests/<your-input> directly (adds .js if missing)
  if [[ "$SCRIPT" != *.js ]]; then
    SCRIPT="${SCRIPT}.js"
  fi

  k6 run "tests/${SCRIPT}"
fi