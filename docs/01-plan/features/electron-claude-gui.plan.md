# Plan: Electron Claude GUI (bkitGUI)

> **Feature**: electron-claude-gui
> **Phase**: Plan
> **Created**: 2026-02-23
> **Level**: Dynamic

---

## 1. Project Intent Analysis (프로젝트 의도 분석)

### 1.1 왜 이 프로젝트가 만들어졌는가?

**핵심 의도**: Claude Code CLI의 진입 장벽을 낮추고, bkit 플러그인 워크플로우를 비개발자/팀 관리자도 사용할 수 있는 데스크톱 GUI로 감싸는 것.

| 관점 | 분석 |
|------|------|
| **CLI 한계 극복** | Claude Code는 터미널 기반 → 비개발자에게 접근성이 낮음. GUI로 감싸서 버튼 클릭으로 claude login, bkit 설치, 프롬프트 전송 가능 |
| **업무 관리 통합** | 단순 CLI wrapper가 아닌 "AI 기반 사무실" 컨셉. 업무/의사결정/에이전트/보고서/공지를 한 곳에서 관리 |
| **bkit 생태계 확장** | bkit 플러그인(스킬 카드, 학습 히스토리)의 개념을 시각적으로 표현하여 게이미피케이션 효과 |
| **팀 협업 도구** | "부서 현황", "에이전트 운영" 등은 AI 에이전트를 팀원처럼 관리하려는 비전 반영 |

### 1.2 타겟 사용자

| 페르소나 | 설명 |
|----------|------|
| **팀 리더/PM** | Claude를 통해 팀 업무를 관리하고 보고서를 생성하고 싶은 관리자 |
| **비개발자** | 터미널에 익숙하지 않지만 AI 코딩 도구를 사용하고 싶은 기획자/디자이너 |
| **bkit 사용자** | 이미 bkit을 사용 중이며 GUI 기반 워크플로우를 원하는 개발자 |

### 1.3 현재 구현 수준 (MVP)

현재 **MVP 단계**로 다음이 구현됨:

- [x] Electron + node-pty + xterm.js 터미널 임베딩
- [x] Claude CLI 시작/로그인/bkit 설치 원클릭
- [x] 프롬프트 전송 + 채팅 버블 표시
- [x] 모델 선택 (sonnet/opus/haiku)
- [x] 세션 저장/불러오기
- [x] 사무실 관리 UI (업무/의사결정/에이전트/보고서/공지/대시보드)
- [x] localStorage 기반 상태 영속화
- [x] 판타지/중세풍 디자인 시스템

---

## 2. Architecture Analysis (아키텍처 분석)

### 2.1 현재 아키텍처

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process (main.js)                     │
│  ├── BrowserWindow (contextIsolation: true)         │
│  ├── node-pty → shell → claude CLI                  │
│  └── IPC Handlers                                   │
│       ├── terminal:start/write/resize/stop          │
│       ├── claude:check                              │
│       ├── app:meta                                  │
│       └── session:save/load                         │
├─────────────────────────────────────────────────────┤
│ Preload (preload.js)                                │
│  └── contextBridge.exposeInMainWorld("desktopAPI")  │
├─────────────────────────────────────────────────────┤
│ Renderer Process (app.js + index.html)              │
│  ├── xterm.js Terminal                              │
│  ├── Chat Console (프롬프트 → 터미널 → 채팅 버블)    │
│  ├── SPA Router (data-view 기반)                    │
│  ├── 8개 뷰 (문서고/오피스/대시보드/업무/...)         │
│  └── localStorage 기반 상태 관리                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 핵심 문제점

| 카테고리 | 심각도 | 문제 | 위치 |
|----------|--------|------|------|
| **구조** | Critical | app.js 968줄 단일 파일 — 라우팅, 상태, 렌더링, 이벤트 혼재 | `app.js` 전체 |
| **보안** | Major | `sandbox: false` — Electron 보안 모범 사례 위반 | `main.js:23` |
| **보안** | Major | innerHTML로 동적 HTML 생성 — escapeHtml 누락 시 XSS 위험 | `app.js` 다수 |
| **안정성** | Major | 터미널 출력 파싱이 `includes()` 문자열 매칭 기반 — Claude 출력 형식 변경에 취약 | `app.js:551-563` |
| **성능** | Minor | 전체 리스트 innerHTML 재렌더링 — 대량 데이터 시 성능 저하 | `app.js` 렌더 함수들 |
| **확장성** | Major | 모듈 시스템 없음 (순수 JS, import/export 미사용) | `app.js` 전체 |
| **테스트** | Critical | 테스트 코드 없음 | 프로젝트 전체 |
| **타입** | Minor | TypeScript 미사용 — 런타임 에러 가능성 | 프로젝트 전체 |

---

## 3. Feature Roadmap (기능 로드맵)

### Phase 1: 아키텍처 안정화 (Foundation)

> 현재 MVP 코드를 프로덕션 수준으로 올리는 리팩토링

| ID | 기능 | 우선순위 | 설명 |
|----|------|----------|------|
| F-1.1 | **모듈 분리** | P0 | app.js를 modules/ 디렉토리로 분리: router.js, state.js, terminal-bridge.js, chat.js, views/ |
| F-1.2 | **빌드 시스템** | P0 | Vite + electron-vite 도입으로 ESM 모듈, HMR, 번들링 지원 |
| F-1.3 | **TypeScript 마이그레이션** | P1 | 점진적 TS 전환으로 타입 안전성 확보 |
| F-1.4 | **보안 강화** | P0 | sandbox:true 전환, CSP 헤더 설정, innerHTML → DOM API/템플릿 리터럴 |
| F-1.5 | **테스트 프레임워크** | P1 | Vitest + Playwright (E2E) 설정 |

### Phase 2: 터미널-채팅 고도화 (Core Experience)

> 핵심 사용 경험인 Claude 상호작용을 강화

| ID | 기능 | 우선순위 | 설명 |
|----|------|----------|------|
| F-2.1 | **구조화된 출력 파싱** | P0 | Claude CLI의 JSON/Streaming API 모드 활용으로 안정적 출력 파싱 (문자열 매칭 탈피) |
| F-2.2 | **Markdown 렌더링** | P0 | Claude 응답을 Markdown으로 렌더링 (코드 하이라이팅, 테이블, 리스트) |
| F-2.3 | **멀티 세션** | P1 | 여러 Claude 세션을 탭으로 관리 (프로젝트별 독립 작업) |
| F-2.4 | **파일 탐색기 연동** | P1 | 좌측에 프로젝트 파일 트리 표시, Claude가 수정한 파일 실시간 하이라이트 |
| F-2.5 | **프롬프트 템플릿** | P2 | 자주 쓰는 프롬프트를 카테고리별로 저장/재사용 |
| F-2.6 | **스트리밍 응답** | P0 | 청크 버퍼링 → 실시간 스트리밍 표시 (타이핑 효과) |

### Phase 3: bkit PDCA 통합 (Workflow Integration)

> bkit 플러그인의 PDCA 워크플로우를 네이티브 GUI로 표현

| ID | 기능 | 우선순위 | 설명 |
|----|------|----------|------|
| F-3.1 | **PDCA 대시보드** | P0 | Plan→Design→Do→Check→Act 진행 상태를 시각적 파이프라인으로 표시 |
| F-3.2 | **PDCA 문서 뷰어** | P1 | plan.md, design.md 등 PDCA 문서를 GUI 내에서 미리보기/편집 |
| F-3.3 | **.pdca-status.json 연동** | P0 | bkit의 PDCA 상태 파일을 실시간 읽어서 대시보드에 반영 |
| F-3.4 | **Gap Analysis 시각화** | P1 | 갭 분석 결과를 차트/그래프로 시각화 (Match Rate 게이지) |
| F-3.5 | **스킬 마켓플레이스** | P2 | 현재 하드코딩된 스킬 카드를 실제 bkit 스킬 목록에서 동적 로드 |
| F-3.6 | **에이전트 모니터링** | P1 | bkit Agent Teams 실행 시 각 에이전트 상태를 실시간 표시 |

### Phase 4: 팀 협업 기능 (Team Features)

> "사무실 관리" 컨셉을 실제 유용한 팀 도구로 발전

| ID | 기능 | 우선순위 | 설명 |
|----|------|----------|------|
| F-4.1 | **팀 상태 동기화** | P1 | localStorage → SQLite/파일 DB 전환, 팀원 간 상태 공유 |
| F-4.2 | **실시간 에이전트 대시보드** | P0 | `.bkit/agent-state.json` 연동으로 실제 AI 에이전트 상태 표시 |
| F-4.3 | **업무 보드 (칸반)** | P2 | 현재 리스트형 업무 관리를 칸반 보드로 업그레이드 |
| F-4.4 | **보고서 자동 생성** | P1 | bkit report-generator 연동으로 실제 PDCA 보고서 생성/표시 |
| F-4.5 | **의사결정 로그 AI 연동** | P2 | Claude에게 의사결정 컨텍스트를 전달하여 AI 기반 의사결정 보조 |

### Phase 5: 데스크톱 앱 완성도 (Polish)

> 배포 가능한 수준의 데스크톱 앱으로 완성

| ID | 기능 | 우선순위 | 설명 |
|----|------|----------|------|
| F-5.1 | **자동 업데이트** | P1 | electron-updater를 통한 자동 업데이트 메커니즘 |
| F-5.2 | **다크 모드** | P1 | 현재 따뜻한 톤 + 다크 테마 토글 |
| F-5.3 | **키보드 단축키** | P1 | Cmd+N (새 세션), Cmd+Enter (전송), Cmd+K (터미널 클리어) 등 |
| F-5.4 | **트레이 아이콘** | P2 | 시스템 트레이에 상주, 빠른 프롬프트 입력 |
| F-5.5 | **앱 패키징** | P1 | electron-builder로 macOS/Windows/Linux 배포 패키지 |
| F-5.6 | **성능 최적화** | P1 | 가상 스크롤(채팅), 메모리 관리, 앱 시작 속도 개선 |
| F-5.7 | **알림 시스템** | P2 | Claude 응답 완료, 에이전트 작업 완료 시 OS 네이티브 알림 |

---

## 4. Implementation Priority Matrix (구현 우선순위)

```
          긴급도 →
  ┌───────────────────────────────────┐
  │  P0 (즉시)     │  P1 (다음)       │
  │                 │                  │
중│  F-1.1 모듈분리  │  F-1.3 TypeScript│
요│  F-1.2 빌드시스템│  F-1.5 테스트    │
도│  F-1.4 보안강화  │  F-2.3 멀티세션  │
  │  F-2.1 출력파싱  │  F-2.4 파일탐색  │
↓ │  F-2.2 Markdown │  F-3.2 문서뷰어  │
  │  F-2.6 스트리밍  │  F-3.4 갭시각화  │
  │  F-3.1 PDCA대시 │  F-3.6 에이전트  │
  │  F-3.3 상태연동  │  F-4.1 DB전환   │
  │  F-4.2 에이전트  │  F-4.4 보고서   │
  │                 │  F-5.1~5.6      │
  ├─────────────────┼──────────────────┤
  │  P2 (나중)      │  Backlog         │
  │  F-2.5 템플릿   │                  │
  │  F-3.5 마켓     │                  │
  │  F-4.3 칸반     │                  │
  │  F-4.5 AI의사결정│                  │
  │  F-5.4 트레이   │                  │
  │  F-5.7 알림     │                  │
  └─────────────────┴──────────────────┘
```

---

## 5. Technical Decisions (기술 결정)

| 결정 사항 | 선택 | 근거 |
|-----------|------|------|
| 빌드 도구 | **electron-vite** | Electron 특화, ESM 지원, HMR, 빠른 빌드 |
| UI 프레임워크 | **Vanilla → Lit Element (점진적)** | 현재 구조 존중하면서 웹 컴포넌트로 모듈화. React 도입은 과도한 전환 |
| 상태 관리 | **localStorage → electron-store → SQLite** | 단계적 마이그레이션 |
| 터미널 | **node-pty + xterm.js (유지)** | 현재 방식이 적합, 파싱만 개선 |
| 스타일 | **CSS Variables (유지) + 다크 테마 추가** | 현재 디자인 시스템이 잘 구축됨 |
| 테스트 | **Vitest (Unit) + Playwright (E2E)** | Electron 테스트에 적합 |
| 패키징 | **electron-builder** | macOS/Windows/Linux 크로스 플랫폼 지원 |

---

## 6. Recommended First Sprint

**Phase 1 + Phase 2 핵심 (2주 목표)**:

1. **electron-vite 빌드 시스템 도입** → ESM 모듈화 기반 확보
2. **app.js 모듈 분리** → router.js, state.js, terminal-bridge.js, chat.js, views/
3. **sandbox:true + CSP 설정** → 보안 강화
4. **Markdown 렌더링** → marked.js 또는 markdown-it 도입
5. **스트리밍 표시 개선** → 청크 버퍼 → 실시간 타이핑 효과

---

## 7. Success Metrics (성공 지표)

| 지표 | 현재 | 목표 |
|------|------|------|
| 모듈 수 | 5 파일 | 15+ 모듈 |
| 테스트 커버리지 | 0% | 60%+ |
| 보안 점수 | sandbox:false | sandbox:true + CSP |
| 출력 파싱 안정성 | 문자열 매칭 | 구조화 API |
| 앱 시작 시간 | 측정 안됨 | < 3초 |
| PDCA 연동 | 없음 | .pdca-status.json 실시간 |
