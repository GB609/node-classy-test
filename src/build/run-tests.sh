#!/bin/bash

ROOT_DIR="$(dirname "$(realpath "$0")")"
ROOT_DIR="$(realpath "$ROOT_DIR"/../..)"

SRC_DIR="$ROOT_DIR"/src/js
TESTSRC_DIR="$ROOT_DIR"/test/js

shopt -s globstar dotglob

TESTS=("${TESTSRC_DIR}"/**/*.test.{mj,j}s)

export ROOT_DIR SRC_DIR TESTSRC_DIR

export NODE_PATH="$TESTSRC_DIR:$SRC_DIR"

#node

#exit 0
node --import "${SRC_DIR}/node-classy-test.mjs" \
  --trace-exit --trace-uncaught --trace-deprecation \
  --test-isolation=process \
  --test "${TESTS[@]}"