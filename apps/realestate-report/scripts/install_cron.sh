#!/usr/bin/env bash
# macOS / Linux: 매일 지정 시각에 수집 + 리포트 생성 (기본 07:10).
#   ./scripts/install_cron.sh          # 07:10
#   ./scripts/install_cron.sh 6 30     # 06:30
set -eu
HOUR="${1:-7}"; MIN="${2:-10}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$DIR/scripts/run_daily.sh"
LINE="$MIN $HOUR * * * $DIR/scripts/run_daily.sh >> $DIR/data/cron.log 2>&1 # realestate-report"
mkdir -p "$DIR/data"
( crontab -l 2>/dev/null | grep -v '# realestate-report' ; echo "$LINE" ) | crontab -
echo "등록됨: $LINE"
echo "macOS 에서는 '시스템 설정 > 개인정보 보호 및 보안 > 전체 디스크 접근'에 cron 권한이 필요할 수 있습니다."
