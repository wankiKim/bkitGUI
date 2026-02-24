import { store } from '../core/store'
import { escapeHtml } from '../components/list-renderer'
import type { ClaudeSession } from '../services/claude-session'

declare const window: Window & {
  desktopAPI: {
    readFile: (relativePath: string) => Promise<string>
    [key: string]: any
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class LibraryView {
  private heroEl: HTMLElement
  private cardsEl: HTMLElement
  private tabsEl: HTMLElement
  private filtersEl: HTMLElement
  private historyListEl: HTMLElement
  private docFormEl: HTMLElement
  private docListEl: HTMLElement
  private docTitleInput: HTMLInputElement
  private docTypeEl: HTMLSelectElement
  private previewModal: HTMLElement
  private previewTitle: HTMLElement
  private previewBody: HTMLPreElement
  private previewCloseBtn: HTMLElement

  constructor(private session: ClaudeSession) {
    this.heroEl = document.getElementById('libraryHero')!
    this.cardsEl = document.getElementById('libraryCards')!
    this.tabsEl = document.getElementById('libraryTabs')!
    this.filtersEl = document.getElementById('libraryFilters')!
    this.historyListEl = document.getElementById('libraryHistoryList')!
    this.docFormEl = document.getElementById('libraryDocForm')!
    this.docListEl = document.getElementById('docList')!
    this.docTitleInput = document.getElementById('docTitle') as HTMLInputElement
    this.docTypeEl = document.getElementById('docType') as HTMLSelectElement
    this.previewModal = document.getElementById('docPreviewModal')!
    this.previewTitle = document.getElementById('docPreviewTitle')!
    this.previewBody = document.getElementById('docPreviewBody') as HTMLPreElement
    this.previewCloseBtn = document.getElementById('btnClosePreview')!

    this.setupListeners()

    store.subscribe(
      s => s.ui.libraryTab,
      () => this.render()
    )
    store.subscribe(
      s => s.ui.libraryFilter,
      () => this.render()
    )
    store.subscribe(
      s => s.ops.docs,
      () => this.renderDocs()
    )
    store.subscribe(
      s => s.ui.route,
      (route) => {
        if (route === 'library') this.render()
      }
    )
  }

  render(): void {
    if (!this.heroEl) return
    const { libraryTab, libraryFilter } = store.getState().ui
    const showHistory = libraryTab === 'history'

    this.historyListEl.style.display = showHistory ? '' : 'none'
    this.docFormEl.style.display = showHistory ? '' : 'none'
    this.docListEl.style.display = showHistory ? '' : 'none'
    this.cardsEl.style.display = showHistory ? 'none' : 'grid'

    // Tab highlight
    this.tabsEl.querySelectorAll<HTMLElement>('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === libraryTab)
    })

    // Filter highlight
    this.filtersEl.querySelectorAll<HTMLElement>('[data-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === libraryFilter)
    })

    // Apply filter
    const applyFilter = (rootEl: HTMLElement) => {
      rootEl.querySelectorAll<HTMLElement>('.learning-item').forEach(item => {
        const provider = item.dataset.provider || 'claude'
        item.style.display = (libraryFilter === 'all' || provider === libraryFilter) ? '' : 'none'
      })
    }
    applyFilter(this.historyListEl)
    applyFilter(this.docListEl)
  }

  renderDocs(): void {
    const docs = store.getState().ops.docs
    if (docs.length === 0) {
      this.docListEl.innerHTML = '<article class="learning-item"><div class="agent-label">문서가 없습니다.</div></article>'
    } else {
      this.docListEl.innerHTML = docs.map(d => `
        <article class="learning-item" data-provider="claude">
          <div class="title">${escapeHtml(d.title)}</div>
          <div class="agent-label">${escapeHtml(d.type)} · ${escapeHtml(d.updatedAt)}</div>
          <div class="form-row">
            <button data-action="open-doc" data-id="${d.id}">열기</button>
            <button data-action="delete-doc" data-id="${d.id}">삭제</button>
          </div>
        </article>
      `).join('')
    }
    this.render()
  }

  private showPreview(title: string, content: string): void {
    this.previewTitle.textContent = title
    this.previewBody.textContent = content
    this.previewModal.style.display = ''
  }

  private hidePreview(): void {
    this.previewModal.style.display = 'none'
    this.previewBody.textContent = ''
  }

  private async openDoc(id: string): Promise<void> {
    const doc = store.getState().ops.docs.find(d => d.id === id)
    if (!doc) return

    // Log activity
    store.update(prev => {
      const ops = { ...prev.ops }
      ops.activities = [
        { id: randomId(), message: `문서 열람: ${doc.title}`, at: new Date().toLocaleString() },
        ...ops.activities.slice(0, 24)
      ]
      return { ops }
    })

    // Try to read the file if doc has a path
    if (doc.path) {
      try {
        const content = await window.desktopAPI.readFile(doc.path)
        this.showPreview(doc.title, content)
        return
      } catch {
        // Fall through to chat fallback
      }
    }

    // Fallback: show in chat
    store.update(prev => ({
      chat: {
        ...prev.chat,
        messages: [...prev.chat.messages, {
          role: 'assistant' as const,
          text: `[Doc] ${doc.type}: ${doc.title}`,
          at: new Date().toISOString()
        }]
      }
    }))
  }

  private setupListeners(): void {
    // Close preview modal
    this.previewCloseBtn.addEventListener('click', () => this.hidePreview())
    this.previewModal.addEventListener('click', (e) => {
      if (e.target === this.previewModal) this.hidePreview()
    })

    this.tabsEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')
      if (btn?.dataset.tab) {
        store.update(prev => ({ ui: { ...prev.ui, libraryTab: btn.dataset.tab! } }))
      }
    })

    this.filtersEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]')
      if (btn?.dataset.filter) {
        store.update(prev => ({ ui: { ...prev.ui, libraryFilter: btn.dataset.filter! } }))
      }
    })

    this.cardsEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.btn-learn-skill')
      if (!btn?.dataset.skill) return
      const skill = btn.dataset.skill
      store.update(prev => {
        const ops = { ...prev.ops }
        ops.docs = [
          { id: randomId(), title: `${skill} 학습 노트`, type: 'PLAYBOOK', updatedAt: new Date().toLocaleDateString() },
          ...ops.docs
        ]
        ops.activities = [
          { id: randomId(), message: `스킬 학습 시작: ${skill}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
        return {
          ops,
          chat: {
            ...prev.chat,
            messages: [...prev.chat.messages, {
              role: 'assistant' as const,
              text: `[Skill] ${skill} 학습이 문서고에 추가되었습니다.`,
              at: new Date().toISOString()
            }]
          },
          ui: { ...prev.ui, libraryTab: 'history', route: 'library' }
        }
      })

      // Send skill install command to Claude
      this.session.sendCommand(
        `/skill install ${skill}`,
        `스킬 설치 명령 전송: ${skill}`
      )
    })

    document.getElementById('btnAddDoc')!.addEventListener('click', () => {
      const title = this.docTitleInput.value.trim()
      const type = this.docTypeEl.value
      if (!title) return
      store.update(prev => {
        const ops = { ...prev.ops }
        ops.docs = [{ id: randomId(), title, type, updatedAt: new Date().toLocaleDateString() }, ...ops.docs]
        ops.activities = [
          { id: randomId(), message: `문서 추가: ${title}`, at: new Date().toLocaleString() },
          ...ops.activities.slice(0, 24)
        ]
        return { ops }
      })
      this.docTitleInput.value = ''
    })

    this.docListEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]')
      if (!btn) return
      const { id, action } = btn.dataset
      if (!id) return

      if (action === 'open-doc') {
        this.openDoc(id)
        return
      }

      if (action === 'delete-doc') {
        store.update(prev => {
          const ops = { ...prev.ops }
          const target = ops.docs.find(d => d.id === id)
          if (!target) return {}
          ops.docs = ops.docs.filter(d => d.id !== id)
          ops.activities = [
            { id: randomId(), message: `문서 삭제: ${target.title}`, at: new Date().toLocaleString() },
            ...ops.activities.slice(0, 24)
          ]
          return { ops }
        })
      }
    })
  }
}
