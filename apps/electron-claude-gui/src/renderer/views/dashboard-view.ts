import { store } from '../core/store'
import { PdcaWatcher } from '../services/pdca-watcher'
import { ClaudeSession } from '../services/claude-session'

const PHASE_COMMANDS: Record<string, string> = {
  plan: '/pdca plan',
  design: '/pdca design',
  do: '/pdca do',
  check: '/pdca analyze',
  act: '/pdca iterate',
}

export class DashboardView {
  private kpiTasksDone: HTMLElement
  private kpiTasksTodo: HTMLElement
  private kpiDecisions: HTMLElement
  private kpiNotices: HTMLElement

  constructor(private session: ClaudeSession) {
    this.kpiTasksDone = document.getElementById('kpiTasksDone')!
    this.kpiTasksTodo = document.getElementById('kpiTasksTodo')!
    this.kpiDecisions = document.getElementById('kpiDecisions')!
    this.kpiNotices = document.getElementById('kpiNotices')!

    store.subscribe(s => s.ops.tasks, () => this.renderKpis())
    store.subscribe(s => s.ops.decisions, () => this.renderKpis())
    store.subscribe(s => s.ops.notices, () => this.renderKpis())
    store.subscribe(s => s.pdca, () => this.renderPdca())
  }

  renderKpis(): void {
    const { tasks, decisions, notices } = store.getState().ops
    const done = tasks.filter((t: any) => t.done).length
    const todo = tasks.filter((t: any) => !t.done).length
    this.kpiTasksDone.textContent = `${done}건`
    this.kpiTasksTodo.textContent = `${todo}건`
    this.kpiDecisions.textContent = `${decisions.length}건`
    this.kpiNotices.textContent = `${notices.length}건`
  }

  renderPdca(): void {
    const pdca = store.getState().pdca
    const container = document.getElementById('pdcaDashboard')
    if (!container) return

    if (!pdca) {
      container.innerHTML = '<div class="pdca-placeholder">PDCA 상태를 로딩 중입니다...</div>'
      return
    }

    const primary = pdca.features[pdca.primaryFeature]
    if (!primary) {
      container.innerHTML = '<div class="pdca-placeholder">PDCA feature 정보가 없습니다.</div>'
      return
    }

    container.textContent = ''

    // Pipeline visualization
    const pipeline = document.createElement('div')
    pipeline.className = 'pdca-pipeline'

    const phases = ['plan', 'design', 'do', 'check', 'act']
    const currentIdx = phases.indexOf(primary.phase)

    phases.forEach((p, i) => {
      if (i > 0) {
        const arrow = document.createElement('span')
        arrow.className = 'pdca-arrow'
        arrow.textContent = '\u2192'
        pipeline.appendChild(arrow)
      }

      const display = PdcaWatcher.phaseToDisplay(p)
      const status = i < currentIdx ? '\u2705' : i === currentIdx ? '\uD83D\uDD04' : '\u23F3'
      const isClickable = i >= currentIdx && i <= currentIdx + 1
      const span = document.createElement('span')
      span.className = 'pdca-phase'
      if (i === currentIdx) span.className += ' current'
      if (isClickable) span.className += ' clickable'
      span.textContent = `${status} ${display.label}`

      if (isClickable) {
        span.addEventListener('click', () => {
          this.executePdcaCommand(p, pdca.primaryFeature)
        })
      }

      pipeline.appendChild(span)
    })

    container.appendChild(pipeline)

    // Info section
    const info = document.createElement('div')
    info.className = 'pdca-info'

    const featureLine = document.createElement('div')
    featureLine.textContent = `Feature: ${pdca.primaryFeature}`
    info.appendChild(featureLine)

    const phaseLine = document.createElement('div')
    phaseLine.textContent = `Phase: ${PdcaWatcher.phaseToDisplay(primary.phase).label}`
    info.appendChild(phaseLine)

    container.appendChild(info)

    // Match Rate gauge
    if (primary.matchRate !== null) {
      const gauge = document.createElement('div')
      gauge.className = 'pdca-gauge'

      const label = document.createElement('div')
      label.className = 'pdca-gauge-label'
      label.textContent = `Match Rate: ${primary.matchRate}%`
      gauge.appendChild(label)

      const track = document.createElement('div')
      track.className = 'pdca-gauge-track'

      const fill = document.createElement('div')
      fill.className = `pdca-gauge-fill ${primary.matchRate >= 90 ? 'high' : primary.matchRate >= 70 ? 'mid' : 'low'}`
      fill.style.width = `${Math.min(primary.matchRate, 100)}%`
      track.appendChild(fill)
      gauge.appendChild(track)

      container.appendChild(gauge)
    }

    // Iterations display
    const iterations = document.createElement('div')
    iterations.className = 'pdca-iterations'
    iterations.textContent = `Iterations: ${primary.iterationCount} / 5`
    container.appendChild(iterations)
  }

  private async executePdcaCommand(phase: string, feature: string): Promise<void> {
    const cmd = PHASE_COMMANDS[phase]
    if (!cmd) return
    const command = `${cmd} ${feature}`
    await this.session.sendCommand(command, `PDCA ${phase} 명령 실행: ${feature}`)
  }
}
