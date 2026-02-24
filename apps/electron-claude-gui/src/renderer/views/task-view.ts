import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class TaskView {
  private listEl: HTMLElement
  private titleInput: HTMLInputElement
  private priorityEl: HTMLSelectElement

  constructor() {
    this.listEl = document.getElementById('taskList')!
    this.titleInput = document.getElementById('taskTitle') as HTMLInputElement
    this.priorityEl = document.getElementById('taskPriority') as HTMLSelectElement

    document.getElementById('btnAddTask')!.addEventListener('click', () => this.addTask())

    this.listEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
      if (!btn) return
      const { id, action } = btn.dataset
      if (!id) return
      if (action === 'delete-task') this.deleteTask(id)
      else if (action === 'toggle-task') this.toggleTask(id)
    })

    store.subscribe(s => s.ops.tasks, () => this.render())
  }

  render(): void {
    const tasks = store.getState().ops.tasks
    if (tasks.length === 0) {
      this.listEl.innerHTML = '<article class="learning-item"><div class="agent-label">등록된 업무가 없습니다.</div></article>'
      return
    }
    this.listEl.innerHTML = tasks.map((t: any) => `
      <article class="learning-item">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="agent-label">우선순위: ${escapeHtml(t.priority)} · 상태: ${t.done ? '완료' : '대기'}</div>
        <div class="form-row">
          <button data-action="toggle-task" data-id="${t.id}">${t.done ? '미완료로' : '완료 처리'}</button>
          <button data-action="delete-task" data-id="${t.id}">삭제</button>
        </div>
      </article>
    `).join('')
  }

  private addTask(): void {
    const title = this.titleInput.value.trim()
    const priority = this.priorityEl.value
    if (!title) return
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.tasks = [{ id: randomId(), title, priority, done: false }, ...ops.tasks]
      ops.activities = [
        { id: randomId(), message: `업무 추가: ${title}`, at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { ops }
    })
    this.titleInput.value = ''
  }

  private deleteTask(id: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      const target = ops.tasks.find((t: any) => t.id === id)
      if (target) {
        ops.activities = [
          { id: randomId(), message: `업무 삭제: ${(target as any).title}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
      }
      ops.tasks = ops.tasks.filter((t: any) => t.id !== id)
      return { ops }
    })
  }

  private toggleTask(id: string): void {
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.tasks = ops.tasks.map((t: any) => {
        if (t.id !== id) return t
        const toggled = { ...t, done: !t.done }
        ops.activities = [
          { id: randomId(), message: `업무 상태 변경: ${t.title} (${toggled.done ? '완료' : '대기'})`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
        return toggled
      })
      return { ops }
    })
  }
}
