#!/bin/sh
set -e

# Reconciles the container's dependencies with package.json on every start.
#
# docker-compose.yml keeps node_modules in a named volume so the host's copy
# cannot shadow the container's. Docker seeds such a volume from the image
# exactly once, when it is first created — `docker compose up --build` rebuilds
# the image but leaves the volume untouched. Without this step, every dependency
# added after the first start is simply missing at runtime, and the dev server
# fails with "Module not found" for a package that is plainly in package.json.
#
# `npm install` is incremental: it is a second or two when nothing changed.

echo "[dev] syncing dependencies with package.json"
npm install --no-audit --no-fund --loglevel=error

exec npm run dev
