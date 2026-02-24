# Design: Electron Claude GUI (bkitGUI)

> **Feature**: electron-claude-gui
> **Phase**: Design
> **Created**: 2026-02-23
> **Level**: Dynamic
> **Plan Reference**: `docs/01-plan/features/electron-claude-gui.plan.md`

---

## 1. Target Architecture

### 1.1 Overview

현재 5파일 단일 구조를 **electron-vite 기반 모듈화 구조**로 전환한다.

```
apps/electron-claude-gui/
├── electron.vite.config.ts          # electron-vite 설정
├── package.json                     # 의존성 (electron → devDependencies)
├── tsconfig.json                    # TypeScript 설정
├── tsconfig.node.json               # Main process TS 설정
├── tsconfig.web.json                # Renderer TS 설정
│
├── src/
│   ├── main/                        # Electron Main Process
│   │   ├── index.ts                 # app lifecycle, window 생성
│   │   ├── ipc-handlers.ts          # IPC 핸들러 등록
│   │   ├── shell-manager.ts         # node-pty 셸 관리
│   │   ├── claude-detector.ts       # Claude CLI 설치 확인
│   │   └── session-io.ts            # 세션 파일 저장/로드
│   │
│   ├── preload/
│   │   └── index.ts                 # contextBridge API
│   │
│   └── renderer/                    # Renderer Process
│       ├── index.html
│       ├── main.ts                  # 엔트리포인트
│       ├── styles/
│       │   ├── variables.css        # CSS 변수 (테마)
│       │   ├── layout.css           # 3-column 레이아웃
│       │   ├── components.css       # 공용 컴포넌트 스타일
│       │   └── views.css            # 뷰별 스타일
│       │
│       ├── core/
│       │   ├── router.ts            # SPA 라우터
│       │   ├── store.ts             # 중앙 상태 관리
│       │   ├── event-bus.ts         # 이벤트 버스 (모듈 간 통신)
│       │   └── constants.ts         # 상수 정의
│       │
│       ├── services/
│       │   ├── terminal-bridge.ts   # PTY 터미널 ↔ xterm.js 브릿지
│       │   ├── claude-session.ts    # Claude 세션 상태 관리
│       │   ├── chat-parser.ts       # 터미널 출력 → 채팅 메시지 변환
│       │   └── pdca-watcher.ts      # .pdca-status.json 감시
│       │
│       ├── components/
│       │   ├── chat-log.ts          # 채팅 메시지 목록
│       │   ├── prompt-input.ts      # 프롬프트 입력
│       │   ├── status-panel.ts      # Claude 상태 표시
│       │   ├── nav-bar.ts           # 상단 네비게이션
│       │   ├── side-menu.ts         # 좌측 사이드바
│       │   └── list-renderer.ts     # 제네릭 리스트 렌더러
│       │
│       └── views/
│           ├── library-view.ts      # 문서고/스킬
│           ├── dashboard-view.ts    # 대시보드 (KPI)
│           ├── task-view.ts         # 업무 관리
│           ├── decision-view.ts     # 의사결정
│           ├── agent-view.ts        # 에이전트 운영
│           ├── report-view.ts       # 보고서
│           ├── notice-view.ts       # 전사 공지
│           ├── office-view.ts       # 사무실 관리
│           └── settings-view.ts     # 설정
```

### 1.2 Process Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Main Process (src/main/)                                      │
│                                                               │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ index.ts     │  │ shell-manager │  │ claude-detector   │  │
│  │ BrowserWindow│  │ node-pty      │  │ CLI 감지          │  │
│  │ app lifecycle│  │ 멀티 인스턴스  │  │ 캐싱              │  │
│  └──────┬───────┘  └───────┬───────┘  └───────────────────┘  │
│         │                  │                                  │
│  ┌──────┴──────────────────┴──────────────────────────────┐   │
│  │ ipc-handlers.ts                                        │   │
│  │ 모든 IPC 채널 등록 (terminal:*, claude:*, session:*,   │   │
│  │                      pdca:*, app:*)                    │   │
│  └────────────────────────┬───────────────────────────────┘   │
├───────────────────────────┼───────────────────────────────────┤
│ Preload (contextBridge)   │                                   │
│  desktopAPI.*             │                                   │
├───────────────────────────┼───────────────────────────────────┤
│ Renderer Process          │                                   │
│                           ▼                                   │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────────────┐      │
│  │ Router  │  │ Store       │  │ Services             │      │
│  │ 뷰 전환 │  │ 중앙 상태   │  │ terminal-bridge      │      │
│  │         │←→│ 구독/알림   │←→│ claude-session       │      │
│  └────┬────┘  └──────┬──────┘  │ chat-parser          │      │
│       │              │         │ pdca-watcher          │      │
│       ▼              ▼         └──────────────────────┘      │
│  ┌─────────────────────────────────────────────┐             │
│  │ Views (9개) + Components (6개)              │             │
│  │ Store 구독 → DOM 업데이트 (선택적 렌더링)    │             │
│  └─────────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Module Specifications

### 2.1 Main Process Modules

#### `src/main/index.ts`

```typescript
// 역할: Electron app lifecycle + BrowserWindow 생성
// 현재: main.js의 createWindow() + app.whenReady() + window-all-closed

interface WindowConfig {
  width: number;       // 1320
  height: number;      // 860
  minWidth: number;    // 980
  minHeight: number;   // 620
}

// 변경사항:
// - sandbox: true (node-pty는 main process에서만 사용하므로 가능)
// - CSP 헤더 설정: session.defaultSession.webRequest.onHeadersReceived
// - macOS activate 핸들러 추가
// - BrowserWindow 옵션에 titleBarStyle: 'hiddenInset' (macOS)
```

#### `src/main/shell-manager.ts`

```typescript
// 역할: node-pty 셸 프로세스 생명주기 관리
// 현재: main.js의 startShell(), pickShell() + 전역 shellProcess

interface ShellSession {
  id: string;
  process: IPty;
  cwd: string;
  shell: string;
  createdAt: Date;
}

class ShellManager {
  private sessions: Map<string, ShellSession> = new Map();

  // 멀티 세션 지원 (Phase 2 F-2.3 대비)
  create(options: { cwd?: string; cols?: number; rows?: number }): string;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  destroy(sessionId: string): void;
  destroyAll(): void;

  // 환경변수 필터링 (S-04 해결)
  private filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
}

// filterEnv: API_KEY, TOKEN, SECRET, PASSWORD 패턴 제외
```

#### `src/main/claude-detector.ts`

```typescript
// 역할: Claude CLI 설치 확인 + 결과 캐싱
// 현재: main.js의 checkClaudeInstalled()

interface ClaudeCheckResult {
  installed: boolean;
  version?: string;
  path?: string;
  detail: string;
  checkedAt: Date;
}

class ClaudeDetector {
  private cachedResult: ClaudeCheckResult | null = null;
  private readonly CACHE_TTL = 60_000; // 1분 캐시 (30초 폴링 → 제거)

  async check(force?: boolean): Promise<ClaudeCheckResult>;
  // 플랫폼별 감지 로직은 현재 방식 유지 (execFile)
}
```

#### `src/main/ipc-handlers.ts`

```typescript
// 역할: 모든 IPC 핸들러를 한 곳에 등록
// 현재: main.js의 app.whenReady() 내부에 흩어진 ipcMain.handle()

function registerAllHandlers(
  shellManager: ShellManager,
  claudeDetector: ClaudeDetector,
  mainWindow: BrowserWindow
): void;

// IPC 채널 목록:
// 기존: terminal:start/write/resize/stop, claude:check, app:meta, session:save/load
// 신규: pdca:read-status, pdca:watch, fs:read-file
```

### 2.2 Preload Module

#### `src/preload/index.ts`

```typescript
// 역할: contextBridge를 통한 안전한 API 노출
// 현재: preload.js (14줄)

// 변경사항:
// - 리스너 해제 함수 반환 (S-03 해결)
// - 타입 정의

interface DesktopAPI {
  // Terminal
  startTerminal(options?: { cwd?: string; cols?: number; rows?: number }): Promise<{ id: string; shell: string; cwd: string }>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
  stopTerminal(sessionId: string): Promise<void>;

  // Terminal Events (리스너 해제 함수 반환)
  onTerminalData(sessionId: string, handler: (data: string) => void): () => void;
  onTerminalExit(sessionId: string, handler: () => void): () => void;

  // Claude
  checkClaude(force?: boolean): Promise<ClaudeCheckResult>;

  // App
  appMeta(): Promise<{ platform: string; home: string; cwd: string }>;

  // Session
  saveSession(payload: SessionPayload): Promise<{ canceled: boolean; path?: string }>;
  loadSession(): Promise<{ canceled: boolean; path?: string; data?: SessionPayload }>;

  // PDCA (신규)
  readPdcaStatus(): Promise<PdcaStatus | null>;
  readFile(relativePath: string): Promise<string | null>;
}
```

### 2.3 Renderer Core Modules

#### `src/renderer/core/store.ts`

```typescript
// 역할: 중앙 상태 관리 (localStorage 래핑 + 구독 패턴)
// 현재: app.js의 5개 localStorage 키 + 전역 변수 50개+

interface AppState {
  // Terminal
  terminal: {
    ready: boolean;
    sessionId: string | null;
  };

  // Claude
  claude: {
    started: boolean;
    status: ClaudeCheckResult | null;
    selectedModel: 'sonnet' | 'opus' | 'haiku';
    appliedModel: string | null;
  };

  // Chat
  chat: {
    messages: ChatMessage[];
    history: string[];
    pendingPrompt: string | null;
  };

  // Office
  office: OfficeState;
  ops: OpsState;

  // UI
  ui: {
    route: string;
    libraryTab: 'history' | 'skills';
    libraryFilter: string;
    density: 'cozy' | 'compact';
  };

  // PDCA (신규)
  pdca: PdcaStatus | null;
}

type Selector<T> = (state: AppState) => T;
type Listener<T> = (value: T, prev: T) => void;

class Store {
  private state: AppState;
  private listeners: Set<{ selector: Selector<any>; listener: Listener<any>; prev: any }>;

  getState(): Readonly<AppState>;
  update(partial: Partial<AppState> | ((prev: AppState) => Partial<AppState>)): void;

  // 선택적 구독: 특정 state slice가 변경될 때만 콜백
  subscribe<T>(selector: Selector<T>, listener: Listener<T>): () => void;

  // localStorage 동기화
  persist(): void;
  hydrate(): void;
}

// 사용 예:
// store.subscribe(s => s.chat.messages, (msgs) => chatLog.render(msgs));
// store.subscribe(s => s.ui.route, (route) => router.navigate(route));
```

#### `src/renderer/core/router.ts`

```typescript
// 역할: SPA 뷰 라우팅
// 현재: app.js의 topToRoute/routeToTop/setRoute/renderViews (if-chain)

interface Route {
  id: string;          // 'library', 'dashboard', 'task-manage', ...
  topNav: string;      // 'work', 'office', 'decision', ...
  sideNav: string;     // 'library', 'dashboard', ...
  viewSelector: string; // '[data-view="library"]'
}

const ROUTE_MAP: Route[] = [
  { id: 'library',     topNav: 'work',     sideNav: 'library',     viewSelector: '[data-view="library"]' },
  { id: 'dashboard',   topNav: 'office',   sideNav: 'dashboard',   viewSelector: '[data-view="dashboard"]' },
  { id: 'task-manage', topNav: 'work',     sideNav: 'task-manage', viewSelector: '[data-view="task-manage"]' },
  { id: 'decision',    topNav: 'decision', sideNav: 'decision',    viewSelector: '[data-view="decision"]' },
  { id: 'agent',       topNav: 'agent',    sideNav: 'agent',       viewSelector: '[data-view="agent"]' },
  { id: 'report',      topNav: 'report',   sideNav: 'report',      viewSelector: '[data-view="report"]' },
  { id: 'notice',      topNav: 'notice',   sideNav: 'notice',      viewSelector: '[data-view="notice"]' },
  { id: 'office-home', topNav: 'office',   sideNav: 'office-home', viewSelector: '[data-view="office-home"]' },
  { id: 'office',      topNav: 'office',   sideNav: 'office',      viewSelector: '[data-view="office"]' },
  { id: 'settings',    topNav: 'office',   sideNav: 'settings',    viewSelector: '[data-view="settings"]' },
];

class Router {
  constructor(private store: Store);

  navigate(routeId: string): void;
  // 1. store.update({ ui: { route: routeId } })
  // 2. topNav/sideNav 하이라이트는 store 구독으로 자동 처리
  // 3. view active/inactive 토글

  getRoute(id: string): Route | undefined;
  getTopNavRoute(topNav: string): string;  // topNav값 → routeId
}
```

### 2.4 Renderer Services

#### `src/renderer/services/terminal-bridge.ts`

```typescript
// 역할: PTY 터미널 ↔ xterm.js 양방향 브릿지
// 현재: app.js의 ensureTerminal/term.onData/onTerminalData/resize 등

class TerminalBridge {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private cleanup: (() => void) | null = null;

  constructor(container: HTMLElement, private store: Store);

  async start(cwd?: string): Promise<void>;
  // 1. desktopAPI.startTerminal() 호출
  // 2. onTerminalData 리스너 등록 (해제 함수 저장)
  // 3. store.update({ terminal: { ready: true, sessionId } })

  write(data: string): Promise<void>;
  fit(): void;
  reset(): void;

  async stop(): Promise<void>;
  // cleanup 함수 호출 → 리스너 해제 (S-03 해결)

  destroy(): void;
}
```

#### `src/renderer/services/chat-parser.ts`

```typescript
// 역할: 터미널 스트림을 채팅 메시지로 변환
// 현재: app.js의 stripAnsi/normalizeTerminalText/onAssistantStream/flushAssistantChunk

// 상수 캐싱 (P-02 해결)
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const SKIP_PATTERNS = [
  'Shell started:',
  'Ready.',
  '프롬프트 전송',
  'Claude 세션을 시작했습니다.',
] as const;

const SKIP_PREFIXES = ['> claude-', '$ claude', 'claude'] as const;

class ChatParser {
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_DELAY = 800;

  constructor(private store: Store);

  // 터미널 데이터 수신 시 호출
  onData(rawData: string): void;

  // 내부 메서드
  private normalize(raw: string): string;
  private flush(): void;
  private stripAnsi(str: string): string;

  reset(): void;
}
```

#### `src/renderer/services/claude-session.ts`

```typescript
// 역할: Claude CLI 세션 상태 관리
// 현재: app.js의 ensureClaude/applyModelIfNeeded/claudeStarted 등

class ClaudeSession {
  constructor(
    private bridge: TerminalBridge,
    private store: Store
  );

  async start(): Promise<void>;
  // 1. bridge.start() 호출
  // 2. bridge.write('claude\n')
  // 3. 시작 확인 로직 (U-02 해결: 출력에서 프롬프트 감지)
  // 4. store.update({ claude: { started: true } })

  async applyModel(model: string, force?: boolean): Promise<void>;
  async sendPrompt(text: string): Promise<void>;
  async sendCommand(command: string): Promise<void>;

  async login(): Promise<void>;
  async installBkit(): Promise<void>;
  async addMarketplace(): Promise<void>;
}
```

#### `src/renderer/services/pdca-watcher.ts`

```typescript
// 역할: .pdca-status.json 파일 감시 + PDCA 대시보드 데이터 제공 (F-3.3)
// 현재: 없음 (신규)

interface PdcaFeature {
  phase: string;
  phaseNumber: number;
  matchRate: number | null;
  iterationCount: number;
  documents: Record<string, string>;
  timestamps: { started: string; lastUpdated: string };
}

interface PdcaStatus {
  version: string;
  primaryFeature: string;
  activeFeatures: string[];
  features: Record<string, PdcaFeature>;
}

class PdcaWatcher {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL = 5_000; // 5초

  constructor(private store: Store);

  start(): void;
  // setInterval로 desktopAPI.readPdcaStatus() 호출
  // 변경 감지 시 store.update({ pdca })

  stop(): void;

  // PDCA 단계를 UI 표시용으로 변환
  static phaseToDisplay(phase: string): { label: string; icon: string; color: string };
}
```

### 2.5 Renderer Components

#### `src/renderer/components/list-renderer.ts`

```typescript
// 역할: 제네릭 리스트 렌더링 (M-01 코드 중복 해결)
// 현재: renderDocs, renderDecisions, renderTasks, renderNotices, renderAgents 중복

interface ListConfig<T> {
  container: HTMLElement;
  emptyMessage: string;
  itemRenderer: (item: T) => string;
  onAction?: (action: string, id: string) => void;
}

class ListRenderer<T extends { id: string }> {
  constructor(private config: ListConfig<T>);

  render(items: T[]): void;
  // 빈 배열 → emptyMessage 표시
  // items.map(itemRenderer).join('') → innerHTML
  // event delegation으로 button[data-action][data-id] 처리

  // 증분 렌더링 (P-01 성능 개선)
  append(item: T): void;
  remove(id: string): void;
  update(id: string, item: T): void;
}
```

#### `src/renderer/components/chat-log.ts`

```typescript
// 역할: 채팅 메시지 목록 (증분 렌더링)
// 현재: app.js의 renderChatLog (전체 innerHTML 재렌더링)

class ChatLog {
  private container: HTMLElement;
  private renderedCount = 0;

  constructor(container: HTMLElement, private store: Store);

  init(): void;
  // store.subscribe(s => s.chat.messages, this.onMessagesChanged)

  private onMessagesChanged(messages: ChatMessage[], prev: ChatMessage[]): void;
  // 새 메시지만 append (증분 렌더링)
  // 삭제된 메시지 감지 시에만 전체 재렌더링

  private renderMessage(msg: ChatMessage): HTMLElement;
  // DOM API로 생성 (innerHTML 대신, S-02 XSS 방지)
  // Markdown 렌더링 (Phase 2 F-2.2)

  private scrollToBottom(): void;
}
```

---

## 3. Data Flow

### 3.1 프롬프트 전송 플로우

```
[User] → promptInput (Enter키)
  │
  ▼
[prompt-input.ts]
  │ 1. 텍스트 추출 (멀티라인 유지 — U-03 해결)
  │ 2. store.update({ chat: { pendingPrompt: text } })
  │
  ▼
[claude-session.ts] sendPrompt(text)
  │ 3. store에 user 메시지 추가
  │ 4. bridge.write(text + '\n')
  │ 5. history에 추가
  │
  ▼
[terminal-bridge.ts] → IPC → [shell-manager.ts] → node-pty
  │
  ▼ (PTY 출력 스트림)
[terminal-bridge.ts] onTerminalData
  │ 6. xterm.js에 표시
  │ 7. chatParser.onData(rawData)
  │
  ▼
[chat-parser.ts]
  │ 8. ANSI 스트립 + 잡음 필터링
  │ 9. 800ms 디바운스 후 flush
  │ 10. store.update({ chat: { messages: [..., assistantMsg] } })
  │
  ▼
[chat-log.ts] (store 구독)
  │ 11. 새 메시지 DOM 생성 + append
  └→ [User sees response]
```

### 3.2 PDCA 상태 연동 플로우 (신규)

```
[bkit 플러그인] → .pdca-status.json 파일 갱신
  │
  ▼
[pdca-watcher.ts] (5초 폴링)
  │ 1. desktopAPI.readPdcaStatus()
  │ 2. diff 감지
  │ 3. store.update({ pdca })
  │
  ▼
[dashboard-view.ts] (store 구독)
  │ 4. PDCA 파이프라인 UI 업데이트
  │ 5. Match Rate 게이지 업데이트
  │ 6. 활성 feature 목록 표시
  └→ [User sees PDCA dashboard]
```

### 3.3 상태 영속화 플로우

```
[Any Module] → store.update(partial)
  │
  ▼
[store.ts] 내부
  │ 1. state 병합
  │ 2. 구독자 알림 (selector 비교로 변경된 것만)
  │ 3. debounced persist() → localStorage 저장
  │
  ▼
[앱 재시작 시]
  │ store.hydrate() → localStorage에서 복원
  └→ 구독자 알림 → UI 초기 렌더링
```

---

## 4. Security Design

### 4.1 Electron 보안 설정

```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,              // S-01: true로 변경
    webSecurity: true,
    allowRunningInsecureContent: false,
  }
});

// CSP 헤더 설정 (S-02)
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "font-src 'self'; " +
        "img-src 'self' data:; " +
        "connect-src 'self'"
      ]
    }
  });
});
```

### 4.2 환경변수 필터링

```typescript
// src/main/shell-manager.ts
private filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const SENSITIVE_PATTERNS = [
    /^(API|AUTH|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/i,
    /_(KEY|SECRET|TOKEN|PASSWORD)$/i,
  ];

  const filtered: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!SENSITIVE_PATTERNS.some(p => p.test(key))) {
      filtered[key] = value;
    }
  }
  // 필수 환경변수는 항상 포함
  filtered.PATH = env.PATH;
  filtered.HOME = env.HOME;
  filtered.SHELL = env.SHELL;
  filtered.TERM = 'xterm-256color';
  return filtered;
}
```

### 4.3 Preload 리스너 안전 패턴

```typescript
// src/preload/index.ts
onTerminalData: (sessionId: string, handler: (data: string) => void): (() => void) => {
  const channel = `terminal:data:${sessionId}`;
  const wrapper = (_: IpcRendererEvent, data: string) => handler(data);
  ipcRenderer.on(channel, wrapper);
  // 리스너 해제 함수 반환 (S-03)
  return () => ipcRenderer.removeListener(channel, wrapper);
},
```

### 4.4 DOM XSS 방지

```typescript
// innerHTML 대신 DOM API 사용 패턴
function createMessageElement(msg: ChatMessage): HTMLElement {
  const div = document.createElement('div');
  div.className = `msg msg-${msg.role}`;

  const head = document.createElement('div');
  head.className = 'msg-head';

  const role = document.createElement('div');
  role.className = 'msg-role';
  role.textContent = msg.role === 'user' ? 'You' : 'Claude';  // textContent = 자동 이스케이프

  const text = document.createElement('div');
  text.className = 'msg-text';
  text.textContent = msg.text;  // XSS-safe

  head.appendChild(role);
  div.appendChild(head);
  div.appendChild(text);
  return div;
}
```

---

## 5. UI/UX Design

### 5.1 레이아웃 유지 (3-column)

현재 레이아웃 구조를 유지하되, 반응형 개선:

```
Desktop (>1200px):  [250px sidebar] [flex content] [420px rail]
Tablet (800-1200):  [drawer sidebar] [full content] [drawer rail]
Mobile (<800):      [bottom nav] [full content] [drawer rail]
```

### 5.2 PDCA 대시보드 UI (F-3.1, 신규)

```
┌─ PDCA Pipeline ──────────────────────────────────────┐
│                                                      │
│  [Plan] ──→ [Design] ──→ [Do] ──→ [Check] ──→ [Act] │
│    ✅         ✅          🔄        ⏳         ⏳     │
│                                                      │
│  Feature: electron-claude-gui                        │
│  Phase: Do (Implementation)                          │
│  Started: 2026-02-23                                 │
│                                                      │
│  ┌─ Match Rate ─┐  ┌─ Iterations ─┐                 │
│  │    ---%      │  │    0 / 5     │                 │
│  │  ░░░░░░░░░░  │  │  ░░░░░░░░░░  │                 │
│  └──────────────┘  └──────────────┘                 │
└──────────────────────────────────────────────────────┘
```

### 5.3 다크 모드 CSS 변수 (F-5.2)

```css
/* Light Theme (현재) */
:root {
  --bg: #efe7d8;
  --panel: #f8f1e4;
  --text: #2f2618;
  --muted: #6a5a45;
}

/* Dark Theme */
:root[data-theme="dark"] {
  --bg: #1a1a2e;
  --panel: #16213e;
  --text: #e6edf3;
  --muted: #8b949e;
  --line: #30363d;
  --gold: #e3b341;
}
```

---

## 6. New IPC Channels

### 6.1 PDCA 상태 읽기

```typescript
// Main Process
ipcMain.handle('pdca:read-status', async () => {
  const statusPath = path.join(process.cwd(), 'docs/.pdca-status.json');
  try {
    const content = await fs.readFile(statusPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
});
```

### 6.2 파일 읽기 (PDCA 문서 미리보기용)

```typescript
// Main Process — CWD 기준 상대 경로만 허용 (보안)
ipcMain.handle('fs:read-file', async (_, relativePath: string) => {
  // 경로 탈출 방지
  const resolved = path.resolve(process.cwd(), relativePath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error('Access denied: path traversal detected');
  }
  try {
    return await fs.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
});
```

---

## 7. Migration Strategy

### 7.1 단계별 마이그레이션 (현재 코드 보존)

```
Step 1: electron-vite 설정 + 빌드 파이프라인
  - electron.vite.config.ts 생성
  - package.json scripts 변경 (dev → electron-vite dev)
  - 기존 src/ 파일을 새 구조로 복사 (원본 보존)

Step 2: Main Process 분리 (main.js → 5개 모듈)
  - index.ts + ipc-handlers.ts + shell-manager.ts
  - claude-detector.ts + session-io.ts
  - 기능 변경 없이 구조만 분리

Step 3: Preload 개선
  - 리스너 해제 패턴 적용
  - 타입 정의

Step 4: Renderer Core (store + router)
  - store.ts: 기존 localStorage 로직을 캡슐화
  - router.ts: if-chain → ROUTE_MAP 테이블
  - 기존 app.js의 전역 변수 → store로 마이그레이션

Step 5: Services 분리
  - terminal-bridge.ts: 터미널 관련 로직 추출
  - chat-parser.ts: ANSI 파싱/디바운스 추출
  - claude-session.ts: Claude 세션 관리 추출

Step 6: Components + Views 분리
  - list-renderer.ts: 제네릭 렌더러
  - 각 뷰를 독립 모듈로 분리
  - Event listener를 각 뷰 모듈 내부로 이동

Step 7: 보안 강화
  - sandbox: true
  - CSP 설정
  - innerHTML → DOM API (점진적)

Step 8: PDCA 연동 (신규 기능)
  - pdca-watcher.ts
  - dashboard-view.ts 확장
```

### 7.2 파일 매핑 (현재 → 목표)

| 현재 파일 | 현재 줄 | 목표 모듈 |
|-----------|---------|-----------|
| `main.js:1-8` imports | 8줄 | `main/index.ts` |
| `main.js:9-68` window+shell | 60줄 | `main/index.ts` + `main/shell-manager.ts` |
| `main.js:70-137` checkClaude | 67줄 | `main/claude-detector.ts` |
| `main.js:139-212` IPC handlers | 73줄 | `main/ipc-handlers.ts` + `main/session-io.ts` |
| `main.js:214-222` cleanup | 8줄 | `main/index.ts` |
| `preload.js` | 14줄 | `preload/index.ts` (확장) |
| `app.js:1-49` utils | 49줄 | `core/constants.ts` + 각 모듈 내부 |
| `app.js:51-155` 전역변수+상태 | 105줄 | `core/store.ts` |
| `app.js:181-260` chat 렌더링 | 80줄 | `components/chat-log.ts` |
| `app.js:262-417` ops 렌더링 | 155줄 | `components/list-renderer.ts` + `views/*` |
| `app.js:419-493` routing | 75줄 | `core/router.ts` |
| `app.js:526-574` terminal parse | 48줄 | `services/chat-parser.ts` |
| `app.js:576-607` terminal ops | 31줄 | `services/terminal-bridge.ts` |
| `app.js:592-601` claude session | 10줄 | `services/claude-session.ts` |
| `app.js:655-968` events+init | 313줄 | 각 `views/*.ts` + `main.ts` |

---

## 8. Dependencies

### 8.1 추가 의존성

```json
{
  "devDependencies": {
    "electron": "^40.6.0",
    "electron-vite": "^3.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.1.0"
  },
  "dependencies": {
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-web-links": "^0.12.0",
    "node-pty": "^1.1.0"
  }
}
```

### 8.2 Phase 2 추가 예정

```json
{
  "marked": "^15.0.0",          // Markdown 렌더링 (F-2.2)
  "highlight.js": "^11.11.0"    // 코드 하이라이팅 (F-2.2)
}
```

---

## 9. Implementation Order

```
[Step 1] electron-vite 빌드 시스템 설정
    ↓
[Step 2] Main Process 5개 모듈 분리
    ↓
[Step 3] Preload 리스너 패턴 수정
    ↓
[Step 4] Store + Router 코어 모듈
    ↓
[Step 5] Terminal Bridge + Chat Parser + Claude Session 서비스
    ↓
[Step 6] Components (ChatLog, ListRenderer) + Views (9개)
    ↓
[Step 7] 보안 강화 (sandbox, CSP, DOM API)
    ↓
[Step 8] PDCA Watcher + Dashboard 연동
```

---

## 10. Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|------|-----------|
| AC-1 | `npm run dev`로 앱 정상 실행 | electron-vite dev 정상 동작 |
| AC-2 | 기존 모든 기능 동작 (터미널, 채팅, 세션, 사무실 관리) | 수동 테스트 |
| AC-3 | app.js 단일 파일이 15+ 모듈로 분리됨 | 파일 수 확인 |
| AC-4 | sandbox: true + CSP 설정 | Electron DevTools > Security 탭 |
| AC-5 | IPC 리스너 해제 가능 | 터미널 재시작 시 중복 리스너 없음 |
| AC-6 | Store 기반 상태 관리 (전역 변수 제거) | grep으로 전역 let/var 확인 |
| AC-7 | .pdca-status.json 읽어서 대시보드 표시 | PDCA 활성 시 UI 업데이트 |
| AC-8 | TypeScript 타입 체크 통과 | `tsc --noEmit` 성공 |
