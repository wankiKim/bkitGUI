import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'
import { Router } from '../core/router'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class OfficeView {
  private teamEls: Record<string, HTMLElement>
  private inputs: Record<string, { current: HTMLInputElement; total: HTMLInputElement }>
  private activityListEl: HTMLElement

  constructor(private router: Router) {
    this.teamEls = {
      planning: document.getElementById('team-planning')!,
      dev: document.getElementById('team-dev')!,
      design: document.getElementById('team-design')!,
      ops: document.getElementById('team-ops')!
    }

    this.inputs = {
      planning: {
        current: document.getElementById('planningCurrent') as HTMLInputElement,
        total: document.getElementById('planningTotal') as HTMLInputElement
      },
      dev: {
        current: document.getElementById('devCurrent') as HTMLInputElement,
        total: document.getElementById('devTotal') as HTMLInputElement
      },
      design: {
        current: document.getElementById('designCurrent') as HTMLInputElement,
        total: document.getElementById('designTotal') as HTMLInputElement
      },
      ops: {
        current: document.getElementById('opsCurrent') as HTMLInputElement,
        total: document.getElementById('opsTotal') as HTMLInputElement
      }
    }

    this.activityListEl = document.getElementById('officeActivityList')!

    // Office home navigation buttons
    document.getElementById('btnOfficeGoLibrary')!.addEventListener('click', () => router.navigate('library'))
    document.getElementById('btnOfficeGoTasks')!.addEventListener('click', () => router.navigate('task-manage'))
    document.getElementById('btnOfficeGoSettings')!.addEventListener('click', () => router.navigate('settings'))

    document.getElementById('btnSaveOffice')!.addEventListener('click', () => this.save())

    store.subscribe(s => s.office, () => this.render())
    store.subscribe(s => s.ops.activities, () => this.renderActivities())
  }

  render(): void {
    const office = store.getState().office
    const fmt = (v: { current: number; total: number }) => `${v.current}/${v.total}`

    for (const [key, el] of Object.entries(this.teamEls)) {
      el.textContent = fmt((office as any)[key])
    }

    for (const [key, inp] of Object.entries(this.inputs)) {
      inp.current.value = String((office as any)[key].current)
      inp.total.value = String((office as any)[key].total)
    }
  }

  renderActivities(): void {
    const activities = store.getState().ops.activities
    if (activities.length === 0) {
      this.activityListEl.innerHTML =
        '<article class="learning-item"><div class="agent-label">최근 활동이 없습니다.</div></article>'
      return
    }
    this.activityListEl.innerHTML = activities.map((a: any) => `
      <article class="learning-item">
        <div class="title">${escapeHtml(a.message)}</div>
        <div class="agent-label">${escapeHtml(a.at)}</div>
      </article>
    `).join('')
  }

  private save(): void {
    store.update(prev => {
      const office = {
        planning: { current: Number(this.inputs.planning.current.value || 0), total: Number(this.inputs.planning.total.value || 1) },
        dev: { current: Number(this.inputs.dev.current.value || 0), total: Number(this.inputs.dev.total.value || 1) },
        design: { current: Number(this.inputs.design.current.value || 0), total: Number(this.inputs.design.total.value || 1) },
        ops: { current: Number(this.inputs.ops.current.value || 0), total: Number(this.inputs.ops.total.value || 1) }
      }
      const ops = { ...prev.ops }
      ops.activities = [
        { id: randomId(), message: '사무실 현황 저장', at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { office, ops }
    })
  }
}
