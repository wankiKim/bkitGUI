import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'
import type { ClaudeSession } from '../services/claude-session'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class AgentView {
  private gridEl: HTMLElement

  constructor(private session: ClaudeSession) {
    this.gridEl = document.getElementById('agentGrid')!

    this.gridEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
      if (!btn?.dataset.id) return
      const action = btn.dataset.action
      if (action === 'toggle-agent') {
        this.toggleAgent(btn.dataset.id)
      } else if (action === 'run-agent') {
        this.runAgent(btn.dataset.id)
      }
    })

    store.subscribe(s => s.ops.agents, () => this.render())
  }

  render(): void {
    const agents = store.getState().ops.agents
    this.gridEl.innerHTML = agents.map(a => `
      <article class="learning-item">
        <div class="title">${escapeHtml(a.name)}</div>
        <div class="agent-label">${escapeHtml(a.role)}</div>
        <div class="form-row">
          <button data-action="toggle-agent" data-id="${a.id}">${a.active ? '비활성화' : '활성화'}</button>
          <button class="btn-run-agent" data-action="run-agent" data-id="${a.id}" ${!a.active ? 'disabled' : ''}>실행</button>
          <span class="status">${a.active ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </article>
    `).join('')
  }

  private toggleAgent(id: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.agents = ops.agents.map(a => {
        if (a.id !== id) return a
        const toggled = { ...a, active: !a.active }
        ops.activities = [
          { id: randomId(), message: `에이전트 ${toggled.active ? '활성화' : '비활성화'}: ${a.name}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
        return toggled
      })
      return { ops }
    })
  }

  private async runAgent(id: string): Promise<void> {
    const agent = store.getState().ops.agents.find(a => a.id === id)
    if (!agent || !agent.active) return

    // Update button to "실행 중..." state
    const btn = this.gridEl.querySelector<HTMLButtonElement>(`button[data-action="run-agent"][data-id="${id}"]`)
    if (btn) {
      btn.textContent = '실행 중...'
      btn.disabled = true
    }

    const pdca = store.getState().pdca
    const feature = pdca?.primaryFeature || 'current-feature'

    switch (id) {
      case 'gap-detector':
        await this.session.sendCommand(
          `/pdca analyze ${feature}`,
          `Gap Detector 실행: ${feature}`
        )
        break
      case 'pdca-iterator':
        await this.session.sendCommand(
          `/pdca iterate ${feature}`,
          `PDCA Iterator 실행: ${feature}`
        )
        break
      case 'code-analyzer':
        await this.session.sendPrompt(
          `프로젝트의 코드 품질을 분석해주세요. 코드 복잡도, 중복, 개선점을 보고해주세요.`
        )
        break
      case 'report-generator':
        await this.session.sendCommand(
          `/pdca report ${feature}`,
          `Report Generator 실행: ${feature}`
        )
        break
      default:
        this.session.sendCommand('', `${agent.name}: 아직 준비 중인 에이전트입니다.`)
        if (btn) {
          btn.textContent = '실행'
          btn.disabled = false
        }
        return
    }

    store.update(prev => {
      const ops = { ...prev.ops }
      ops.activities = [
        { id: randomId(), message: `에이전트 실행: ${agent.name}`, at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { ops }
    })

    // Show "실행됨" feedback, then restore (re-query DOM to handle re-render)
    setTimeout(() => {
      const current = this.gridEl.querySelector<HTMLButtonElement>(`button[data-action="run-agent"][data-id="${id}"]`)
      if (current) current.textContent = '실행됨'
    }, 2000)
    setTimeout(() => {
      const current = this.gridEl.querySelector<HTMLButtonElement>(`button[data-action="run-agent"][data-id="${id}"]`)
      if (current) {
        current.textContent = '실행'
        current.disabled = false
      }
    }, 3000)
  }
}
