#!/usr/bin/env bash

# 1. Automatically load .env variables from root or api-performance
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
elif [ -f api-performance/.env ]; then
  export $(grep -v '^#' api-performance/.env | xargs)
fi

export PARENT_GROUP_ID="${PARENT_GROUP_ID:-142584572}"
cd api-performance || exit 1

INPUT="${1:-all}"

run_k6() {
  local file="$1"
  echo -e "\n---> Running: ${file}"
  k6 run "${file}"
  local status=$?
  if [ $status -ne 0 ]; then
    echo "❌ Failed: ${file}"
    exit $status
  fi
}

# 2. Dynamic Execution Logic
if [ "$INPUT" = "all" ]; then
  echo "=========================================="
  echo " Running ALL API Tests in tests/api/"
  echo "=========================================="
  for test_file in tests/api/*.js; do
    [ -e "$test_file" ] || continue
    run_k6 "$test_file"
  done

else
  # Check if exact path exists
  if [ -f "$INPUT" ]; then
    run_k6 "$INPUT"
  elif [ -f "tests/api/${INPUT}" ]; then
    run_k6 "tests/api/${INPUT}"
  elif [ -f "tests/api/${INPUT}.js" ]; then
    run_k6 "tests/api/${INPUT}.js"
  else
    # Fuzzy match: Find any file inside tests/api/ containing the keyword
    MATCHED_FILE=$(find tests/api -type f -name "*${INPUT}*.js" | head -n 1)
    
    if [ -n "$MATCHED_FILE" ]; then
      run_k6 "$MATCHED_FILE"
    else
      echo "❌ Error: Could not find any test matching '$INPUT' inside tests/api/"
      exit 1
    fi
  fi
fi

echo -e "\n✅ Execution finished successfully!"