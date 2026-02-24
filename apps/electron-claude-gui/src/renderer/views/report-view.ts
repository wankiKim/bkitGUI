import { store } from '../core/store'
import { TerminalBridge } from '../services/terminal-bridge'
import { ClaudeSession } from '../services/claude-session'

export class ReportView {
  private textEl: HTMLTextAreaElement
  private waitingForAiReport = false
  private unsubscribe: (() => void) | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private bridge: TerminalBridge, private session: ClaudeSession) {
    this.textEl = document.getElementById('reportText') as HTMLTextAreaElement

    document.getElementById('btnGenerateReport')!.addEventListener('click', () => {
      this.textEl.value = this.generate()
    })

    document.getElementById('btnAiReport')!.addEventListener('click', () => {
      this.generateAiReport()
    })

    document.getElementById('btnCopyReport')!.addEventListener('click', async () => {
      try {
        if (!this.textEl.value.trim()) this.textEl.value = this.generate()
        await navigator.clipboard.writeText(this.textEl.value)
        this.bridge.writeInfo('보고서가 클립보드에 복사되었습니다.')
      } catch {
        this.bridge.writeInfo('복사에 실패했습니다.')
      }
    })
  }

  private generate(): string {
    const { ops, chat } = store.getState()
    const done = ops.tasks.filter((t: any) => t.done).length
    const todo = ops.tasks.filter((t: any) => !t.done).length
    const latestNotice = (ops.notices[0] as any)?.title || '없음'
    const activeAgents = ops.agents.filter(a => a.active).length
    const latestChat = chat.messages
      .slice(-2)
      .map(m => `${m.role}: ${m.text}`)
      .join('\n') || '없음'

    return [
      '# Bkit Office Daily Report',
      '',
      `- 완료 업무: ${done}`,
      `- 대기 업무: ${todo}`,
      `- 의사결정 건수: ${ops.decisions.length}`,
      `- 활성 에이전트: ${activeAgents}`,
      `- 최신 공지: ${latestNotice}`,
      '',
      '## 최근 채팅',
      latestChat
    ].join('\n')
  }

  private buildAiPrompt(): string {
    const { ops, pdca } = store.getState()
    const done = ops.tasks.filter((t: any) => t.done).length
    const todo = ops.tasks.filter((t: any) => !t.done).length
    const activeAgents = ops.agents.filter(a => a.active)
    const decisions = ops.decisions.slice(-5)
    const notices = ops.notices.slice(-3)

    const lines: string[] = [
      '다음 데이터를 바탕으로 일일 업무 보고서를 한국어로 작성해주세요.',
      '마크다운 형식으로, 핵심 요약 / 업무 현황 / 의사결정 / PDCA 진행 / 제안사항 섹션으로 구성해주세요.',
      '',
      '## 업무 현황',
      `- 완료: ${done}건`,
      `- 대기: ${todo}건`,
    ]

    if (ops.tasks.length > 0) {
      lines.push('- 업무 목록:')
      ops.tasks.slice(-10).forEach((t: any) => {
        lines.push(`  - [${t.done ? 'O' : 'X'}] ${t.title || t.id}`)
      })
    }

    if (decisions.length > 0) {
      lines.push('', '## 의사결정 로그')
      decisions.forEach((d: any) => {
        lines.push(`- ${d.title || d.id} (담당: ${d.owner || '미정'})`)
      })
    }

    lines.push('', '## 에이전트 현황')
    activeAgents.forEach(a => {
      lines.push(`- ${a.name} (${a.role}) - 활성`)
    })

    if (pdca) {
      const primary = pdca.features[pdca.primaryFeature]
      if (primary) {
        lines.push(
          '', '## PDCA 진행',
          `- Feature: ${pdca.primaryFeature}`,
          `- Phase: ${primary.phase}`,
          `- Match Rate: ${primary.matchRate !== null ? primary.matchRate + '%' : 'N/A'}`,
          `- Iterations: ${primary.iterationCount}/5`
        )
      }
    }

    if (notices.length > 0) {
      lines.push('', '## 최근 공지')
      notices.forEach((n: any) => {
        lines.push(`- ${n.title || n.id}`)
      })
    }

    return lines.join('\n')
  }

  private cleanupAiReport(btnAiReport: HTMLElement, originalText: string | null): void {
    this.waitingForAiReport = false
    btnAiReport.textContent = originalText
    btnAiReport.removeAttribute('disabled')
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  private async generateAiReport(): Promise<void> {
    // Check if Claude is started
    if (!store.getState().claude.started) {
      this.textEl.value = 'Claude를 먼저 시작해주세요. 우측 패널의 "Claude 시작" 버튼을 클릭하세요.'
      return
    }

    const btnAiReport = document.getElementById('btnAiReport')!
    const originalText = btnAiReport.textContent
    btnAiReport.textContent = '생성 중...'
    btnAiReport.setAttribute('disabled', 'true')

    this.textEl.value = 'AI 보고서를 생성하고 있습니다...'

    // Clean up any previous subscription
    this.cleanupAiReport(btnAiReport, originalText)
    // Re-enable waiting state after cleanup
    this.waitingForAiReport = true
    btnAiReport.textContent = '생성 중...'
    btnAiReport.setAttribute('disabled', 'true')

    // Subscribe to chat messages with debounce to capture complete response
    this.unsubscribe = store.subscribe(
      s => s.chat.messages,
      (messages) => {
        if (!this.waitingForAiReport) return

        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          // Debounce: wait 2s after last update to capture complete response
          if (this.debounceTimer) clearTimeout(this.debounceTimer)
          this.textEl.value = lastMsg.text
          this.debounceTimer = setTimeout(() => {
            // Final capture - response is complete
            this.textEl.value = lastMsg.text
            this.cleanupAiReport(btnAiReport, originalText)
          }, 2000)
        }
      }
    )

    // 10s timeout: if no response arrives
    this.timeoutTimer = setTimeout(() => {
      if (this.waitingForAiReport) {
        if (this.textEl.value === 'AI 보고서를 생성하고 있습니다...') {
          this.textEl.value = '응답 대기 시간이 초과되었습니다. Claude 세션 상태를 확인해주세요.'
        }
        this.cleanupAiReport(btnAiReport, originalText)
      }
    }, 10000)

    // Send the prompt via ClaudeSession
    const prompt = this.buildAiPrompt()
    try {
      await this.session.sendPrompt(prompt)
    } catch {
      this.textEl.value = 'AI 보고서 생성에 실패했습니다. Claude 세션을 확인해주세요.'
      this.cleanupAiReport(btnAiReport, originalText)
    }
  }
}
