import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class DecisionView {
  private listEl: HTMLElement
  private titleInput: HTMLInputElement
  private ownerInput: HTMLInputElement

  constructor() {
    this.listEl = document.getElementById('decisionList')!
    this.titleInput = document.getElementById('decisionTitle') as HTMLInputElement
    this.ownerInput = document.getElementById('decisionOwner') as HTMLInputElement

    document.getElementById('btnAddDecision')!.addEventListener('click', () => this.add())

    this.listEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
      if (!btn) return
      const { id, action } = btn.dataset
      if (!id || !action) return
      if (action === 'delete') this.delete(id)
      else this.updateStatus(id, action === 'approve' ? '승인' : '보류')
    })

    store.subscribe(s => s.ops.decisions, () => this.render())
  }

  render(): void {
    const decisions = store.getState().ops.decisions
    if (decisions.length === 0) {
      this.listEl.innerHTML = '<article class="learning-item"><div class="agent-label">의사결정이 없습니다.</div></article>'
      return
    }
    this.listEl.innerHTML = decisions.map((d: any) => `
      <article class="learning-item">
        <div class="title">${escapeHtml(d.title)}</div>
        <div class="agent-label">Owner: ${escapeHtml(d.owner)} · 상태: ${escapeHtml(d.status)}</div>
        <div class="form-row">
          <button data-action="approve" data-id="${d.id}">승인</button>
          <button data-action="hold" data-id="${d.id}">보류</button>
          <button data-action="delete" data-id="${d.id}">삭제</button>
        </div>
      </article>
    `).join('')
  }

  private add(): void {
    const title = this.titleInput.value.trim()
    const owner = this.ownerInput.value.trim() || '미정'
    if (!title) return
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.decisions = [{ id: randomId(), title, owner, status: '대기' }, ...ops.decisions]
      ops.activities = [
        { id: randomId(), message: `의사결정 등록: ${title}`, at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { ops }
    })
    this.titleInput.value = ''
    this.ownerInput.value = ''
  }

  private delete(id: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      const target = ops.decisions.find((d: any) => d.id === id)
      if (target) {
        ops.activities = [
          { id: randomId(), message: `의사결정 삭제: ${(target as any).title}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
      }
      ops.decisions = ops.decisions.filter((d: any) => d.id !== id)
      return { ops }
    })
  }

  private updateStatus(id: string, status: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.decisions = ops.decisions.map((d: any) => {
        if (d.id !== id) return d
        ops.activities = [
          { id: randomId(), message: `의사결정 상태 변경: ${d.title} (${status})`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
        return { ...d, status }
      })
      return { ops }
    })
  }
}
