import { store, PdcaStatus } from '../core/store'
import { PDCA_POLL_INTERVAL } from '../core/constants'

declare const window: Window & {
  desktopAPI: {
    readPdcaStatus: () => Promise<PdcaStatus | null>
    [key: string]: any
  }
}

export class PdcaWatcher {
  private interval: ReturnType<typeof setInterval> | null = null

  start(): void {
    this.poll()
    this.interval = setInterval(() => this.poll(), PDCA_POLL_INTERVAL)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private async poll(): Promise<void> {
    try {
      const status = await window.desktopAPI.readPdcaStatus()
      const current = store.getState().pdca
      if (JSON.stringify(status) !== JSON.stringify(current)) {
        store.update({ pdca: status })
        // Sync PDCA documents to ops.docs
        if (status) {
          this.syncPdcaDocs(status)
        }
      }
    } catch {
      // silently ignore read errors
    }
  }

  private syncPdcaDocs(status: PdcaStatus): void {
    const primary = status.features[status.primaryFeature]
    if (!primary?.documents) return

    const existingDocs = store.getState().ops.docs
    const existingIds = new Set(existingDocs.map(d => d.id))
    const newDocs: Array<{ id: string; title: string; type: string; path: string; updatedAt: string }> = []

    for (const [docType, docPath] of Object.entries(primary.documents)) {
      const docId = `pdca-${status.primaryFeature}-${docType}`
      if (existingIds.has(docId)) continue

      const typeLabel = docType.toUpperCase().replace(/-/g, ' ')
      newDocs.push({
        id: docId,
        title: `[PDCA] ${status.primaryFeature} - ${typeLabel}`,
        type: docType.includes('plan') ? 'SPEC' : docType.includes('design') ? 'DESIGN' : 'REPORT',
        path: docPath,
        updatedAt: new Date().toLocaleDateString()
      })
    }

    if (newDocs.length > 0) {
      store.update(prev => {
        const ops = { ...prev.ops }
        ops.docs = [...newDocs, ...ops.docs]
        return { ops }
      })
    }
  }

  static phaseToDisplay(phase: string): { label: string; icon: string; color: string } {
    const map: Record<string, { label: string; icon: string; color: string }> = {
      plan: { label: 'Plan', icon: '📋', color: '#3b82f6' },
      design: { label: 'Design', icon: '📐', color: '#8b5cf6' },
      do: { label: 'Do', icon: '🔨', color: '#f59e0b' },
      check: { label: 'Check', icon: '🔍', color: '#10b981' },
      act: { label: 'Act', icon: '🔄', color: '#ef4444' },
      completed: { label: 'Done', icon: '✅', color: '#22c55e' },
      archived: { label: 'Archived', icon: '📦', color: '#6b7280' }
    }
    return map[phase] || { label: phase, icon: '❓', color: '#9ca3af' }
  }
}
