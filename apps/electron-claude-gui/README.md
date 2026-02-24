# Electron Claude GUI (MVP)

`bkit-claude-code` 플러그인을 사용하는 Claude Code를 Electron GUI에서 실행하기 위한 최소 구현입니다.

## What this app does

- 앱 내부 터미널(`node-pty + xterm`)에서 `claude` CLI 실행
- 앱 내부에서 `claude login` 실행 가능
- Claude Code 접속 후 bkit 설치 명령(`/plugin ...`)을 원클릭 실행
- Quick Prompt 입력창으로 Claude에 프롬프트 전송
- 최근 프롬프트 로컬 히스토리 저장
- Claude 응답을 Chat 버블(You/Claude)로 표시
- 세션 저장/불러오기(JSON)
- 모델 선택 및 적용(`sonnet`, `opus`, `haiku`)
- 상단/좌측 전체 메뉴 기능 구현
  - 업무/의사결정/에이전트/보고서/전사 공지/사무실 관리
  - 오피스/문서고/대시보드/업무 관리/설정
  - 각 메뉴의 CRUD/토글/요약/설정이 로컬 스토리지에 저장

## Quick start

```bash
cd /Users/kimwans/Projects/Codex/bkitGUI/apps/electron-claude-gui
npm install
npm run dev
```

## Requirements

- Node.js 18+
- Claude Code CLI 설치 및 PATH 등록 (`claude --version` 동작)

## bkit plugin setup inside Claude

Claude가 실행된 상태에서 다음 명령을 순서대로 입력:

```text
/plugin marketplace add popup-studio-ai/bkit-claude-code
/plugin install bkit
```

## Project structure

```text
apps/electron-claude-gui/
├─ src/main.js              # Electron main + PTY session
├─ src/preload.js           # Safe IPC bridge
└─ src/renderer/
   ├─ index.html
   ├─ app.js                # xterm UI + control buttons
   └─ styles.css
```
