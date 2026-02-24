export const HISTORY_KEY = 'claude_gui_prompt_history_v1'
export const CHAT_STATE_KEY = 'claude_gui_chat_state_v2'
export const OFFICE_STATE_KEY = 'claude_gui_office_state_v1'
export const OPS_STATE_KEY = 'claude_gui_ops_state_v1'
export const APP_SETTINGS_KEY = 'claude_gui_settings_v1'

export const HISTORY_LIMIT = 20
export const CHAT_MESSAGES_LIMIT = 200
export const CHAT_STATE_VERSION = 2

export const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

export const SKIP_PATTERNS = [
  'Shell started:',
  'Ready.',
  '프롬프트 전송',
  'Claude 세션을 시작했습니다.'
] as const

export const SKIP_PREFIXES = ['> claude-', '$ claude', 'claude'] as const

export const FLUSH_DELAY = 800
export const STATUS_POLL_INTERVAL = 30_000
export const PDCA_POLL_INTERVAL = 5_000
