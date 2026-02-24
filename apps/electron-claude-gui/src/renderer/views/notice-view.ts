import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class NoticeView {
  private listEl: HTMLElement
  private titleInput: HTMLInputElement
  private bodyInput: HTMLInputElement

  constructor() {
    this.listEl = document.getElementById('noticeList')!
    this.titleInput = document.getElementById('noticeTitle') as HTMLInputElement
    this.bodyInput = document.getElementById('noticeBody') as HTMLInputElement

    document.getElementById('btnAddNotice')!.addEventListener('click', () => this.add())

    this.listEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
      if (!btn?.dataset.id) return
      this.delete(btn.dataset.id)
    })

    store.subscribe(s => s.ops.notices, () => this.render())
  }

  render(): void {
    const notices = store.getState().ops.notices
    if (notices.length === 0) {
      this.listEl.innerHTML = '<article class="learning-item"><div class="agent-label">등록된 공지가 없습니다.</div></article>'
      return
    }
    this.listEl.innerHTML = notices.map((n: any) => `
      <article class="learning-item">
        <div class="title">${escapeHtml(n.title)}</div>
        <div class="agent-label">${escapeHtml(n.body)}</div>
        <div class="form-row">
          <button data-action="delete-notice" data-id="${n.id}">삭제</button>
        </div>
      </article>
    `).join('')
  }

  private add(): void {
    const title = this.titleInput.value.trim()
    const body = this.bodyInput.value.trim()
    if (!title || !body) return
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.notices = [{ id: randomId(), title, body }, ...ops.notices]
      ops.activities = [
        { id: randomId(), message: `공지 등록: ${title}`, at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { ops }
    })
    this.titleInput.value = ''
    this.bodyInput.value = ''
  }

  private delete(id: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      const target = ops.notices.find((n: any) => n.id === id)
      if (target) {
        ops.activities = [
          { id: randomId(), message: `공지 삭제: ${(target as any).title}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
      }
      ops.notices = ops.notices.filter((n: any) => n.id !== id)
      return { ops }
    })
  }
}
