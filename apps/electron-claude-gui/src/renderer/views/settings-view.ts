import { store, Density, Theme } from '../core/store'

export class SettingsView {
  private densitySelect: HTMLSelectElement
  private themeSelect: HTMLSelectElement
  private systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null

  constructor() {
    this.densitySelect = document.getElementById('appDensity') as HTMLSelectElement
    this.themeSelect = document.getElementById('appTheme') as HTMLSelectElement

    document.getElementById('btnApplySettings')!.addEventListener('click', () => this.applyDensity())
    document.getElementById('btnApplyTheme')!.addEventListener('click', () => this.applyThemeFromSelect())

    store.subscribe(
      s => s.ui.density,
      (density) => {
        this.densitySelect.value = density
        document.body.classList.toggle('density-compact', density === 'compact')
      }
    )

    store.subscribe(
      s => s.ui.theme,
      (theme) => {
        this.themeSelect.value = theme
        this.applyTheme(theme)
      }
    )
  }

  init(): void {
    const { density, theme } = store.getState().ui
    this.densitySelect.value = density
    document.body.classList.toggle('density-compact', density === 'compact')
    this.themeSelect.value = theme
    this.applyTheme(theme)
  }

  private applyTheme(theme: Theme): void {
    // Remove previous system theme listener if any
    if (this.systemThemeListener) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.systemThemeListener)
      this.systemThemeListener = null
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const resolved = mq.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = resolved

      this.systemThemeListener = (e: MediaQueryListEvent) => {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
      }
      mq.addEventListener('change', this.systemThemeListener)
    } else {
      document.documentElement.dataset.theme = theme
    }
  }

  private applyThemeFromSelect(): void {
    const v = this.themeSelect.value
    const theme: Theme = (v === 'light' || v === 'dark' || v === 'system') ? v : 'light'
    store.update(prev => ({
      ui: { ...prev.ui, theme }
    }))
  }

  private applyDensity(): void {
    const v = this.densitySelect.value
    const density: Density = (v === 'cozy' || v === 'compact') ? v : 'cozy'
    store.update(prev => ({
      ui: { ...prev.ui, density }
    }))
  }
}
