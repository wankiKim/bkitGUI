#!/usr/bin/env bash
# 매일 실행용 — cron/launchd 에서 호출한다. 가상환경(.venv)이 있으면 그것을 쓴다.
set -u
cd "$(dirname "$0")/.."
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
exec "$PY" -m realestate run "$@"
