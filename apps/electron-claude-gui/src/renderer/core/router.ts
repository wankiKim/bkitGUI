import { store } from './store'

export interface Route {
  id: string
  topNav: string
  sideNav: string
  viewSelector: string
}

export const ROUTE_MAP: Route[] = [
  { id: 'library', topNav: 'work', sideNav: 'library', viewSelector: '[data-view="library"]' },
  { id: 'dashboard', topNav: 'office', sideNav: 'dashboard', viewSelector: '[data-view="dashboard"]' },
  { id: 'task-manage', topNav: 'work', sideNav: 'task-manage', viewSelector: '[data-view="task-manage"]' },
  { id: 'decision', topNav: 'decision', sideNav: 'decision', viewSelector: '[data-view="decision"]' },
  { id: 'agent', topNav: 'agent', sideNav: 'agent', viewSelector: '[data-view="agent"]' },
  { id: 'report', topNav: 'report', sideNav: 'report', viewSelector: '[data-view="report"]' },
  { id: 'notice', topNav: 'notice', sideNav: 'notice', viewSelector: '[data-view="notice"]' },
  { id: 'office-home', topNav: 'office', sideNav: 'office-home', viewSelector: '[data-view="office-home"]' },
  { id: 'office', topNav: 'office', sideNav: 'office', viewSelector: '[data-view="office"]' },
  { id: 'settings', topNav: 'office', sideNav: 'settings', viewSelector: '[data-view="settings"]' }
]

export class Router {
  private views: HTMLElement[]
  private topNavEl: HTMLElement
  private sideNavEl: HTMLElement

  constructor(topNavEl: HTMLElement, sideNavEl: HTMLElement) {
    this.topNavEl = topNavEl
    this.sideNavEl = sideNavEl
    this.views = Array.from(document.querySelectorAll('.view')) as HTMLElement[]
    this.setupListeners()
    this.setupMobileNav()

    store.subscribe(
      s => s.ui.route,
      (route) => this.renderRoute(route)
    )
  }

  navigate(routeId: string): void {
    store.update(prev => ({
      ui: { ...prev.ui, route: routeId }
    }))
  }

  getRoute(id: string): Route | undefined {
    return ROUTE_MAP.find(r => r.id === id)
  }

  getTopNavRoute(topNav: string): string {
    const mapping: Record<string, string> = {
      work: 'library',
      decision: 'decision',
      agent: 'agent',
      report: 'report',
      notice: 'notice',
      office: 'office-home'
    }
    return mapping[topNav] || 'library'
  }

  private renderRoute(routeId: string): void {
    const route = this.getRoute(routeId)
    if (!route) return

    // Toggle views
    this.views.forEach(view => {
      const modes = (view.dataset.view || '').split(' ').filter(Boolean)
      view.classList.toggle('active', modes.includes(routeId))
    })

    // Top nav highlight
    this.topNavEl.querySelectorAll<HTMLElement>('[data-top]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.top === route.topNav)
    })

    // Side nav highlight (fallback to topNav group's default sideNav item)
    const hasSideMatch = Array.from(this.sideNavEl.querySelectorAll<HTMLElement>('[data-side]'))
      .some(btn => btn.dataset.side === routeId)
    const sideTarget = hasSideMatch ? routeId : this.getTopNavRoute(route.topNav)
    this.sideNavEl.querySelectorAll<HTMLElement>('[data-side]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.side === sideTarget)
    })
  }

  private setupListeners(): void {
    this.topNavEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-top]')
      if (btn?.dataset.top) {
        this.navigate(this.getTopNavRoute(btn.dataset.top))
      }
    })

    this.sideNavEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-side]')
      if (btn?.dataset.side) {
        this.navigate(btn.dataset.side)
      }
    })
  }

  private setupMobileNav(): void {
    const mobileNav = document.getElementById('mobileNav')
    if (!mobileNav) return
    mobileNav.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-top]')
      if (btn?.dataset.top) {
        this.navigate(this.getTopNavRoute(btn.dataset.top))
      }
    })
  }
}
