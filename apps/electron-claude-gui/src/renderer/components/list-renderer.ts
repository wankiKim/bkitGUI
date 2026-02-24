export interface ListConfig<T> {
  container: HTMLElement
  emptyMessage: string
  itemRenderer: (item: T) => string
  onAction?: (action: string, id: string) => void
}

export class ListRenderer<T extends { id: string }> {
  private items: T[] = []

  constructor(private config: ListConfig<T>) {
    if (config.onAction) {
      config.container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
        if (!btn) return
        const { id, action } = btn.dataset
        if (id && action) config.onAction!(action, id)
      })
    }
  }

  render(items: T[]): void {
    this.items = items
    if (items.length === 0) {
      this.config.container.innerHTML =
        `<article class="learning-item"><div class="agent-label">${this.config.emptyMessage}</div></article>`
      return
    }
    this.config.container.innerHTML = items.map(item => this.config.itemRenderer(item)).join('')
  }

  append(item: T): void {
    this.items.push(item)
    if (this.items.length === 1) {
      // Was showing empty message, replace it
      this.config.container.innerHTML = ''
    }
    this.config.container.insertAdjacentHTML('beforeend', this.config.itemRenderer(item))
  }

  remove(id: string): void {
    const idx = this.items.findIndex(i => i.id === id)
    if (idx === -1) return
    this.items.splice(idx, 1)
    if (this.items.length === 0) {
      this.render([])
      return
    }
    const el = this.config.container.querySelector(`[data-item-id="${id}"]`)
    if (el) {
      el.remove()
    } else {
      // Fallback: full re-render
      this.render(this.items)
    }
  }

  update(id: string, updatedItem: T): void {
    const idx = this.items.findIndex(i => i.id === id)
    if (idx === -1) return
    this.items[idx] = updatedItem
    const el = this.config.container.querySelector(`[data-item-id="${id}"]`)
    if (el) {
      el.outerHTML = this.config.itemRenderer(updatedItem)
    } else {
      this.render(this.items)
    }
  }

  getItems(): T[] {
    return this.items
  }
}

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
