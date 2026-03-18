import { useEffect } from 'react'
import { useVimModeStore } from '@/stores/useVimModeStore'
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore'
import { useLayoutStore } from '@/stores/useLayoutStore'

function isInputElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

function isInsideRadixOverlay(el: Element | null): boolean {
  if (!el) return false
  if (el.closest('[data-radix-dialog-content]')) return true
  if (el.closest('[cmdk-root]')) return true
  return false
}

export function useVimNavigation(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const vim = useVimModeStore.getState()
      const { isOpen: commandPaletteOpen } = useCommandPaletteStore.getState()

      if (vim.mode === 'insert' && event.key !== 'Escape') return
      if (document.querySelector('[data-radix-dialog-content]')) return
      if (commandPaletteOpen) return

      if (event.key === 'Escape') {
        if (vim.mode === 'insert') {
          vim.enterNormalMode()
          event.preventDefault()
          return
        }
        if (vim.helpOverlayOpen) {
          vim.setHelpOverlayOpen(false)
          event.preventDefault()
          return
        }
        return
      }

      if (event.key === 'I') {
        const layout = useLayoutStore.getState()
        vim.enterInsertMode()
        const wasCollapsed = layout.leftSidebarCollapsed
        if (wasCollapsed) {
          layout.setLeftSidebarCollapsed(false)
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('hive:focus-project-filter'))
        }, wasCollapsed ? 100 : 0)
        event.preventDefault()
        return
      }

      if (event.key === '?') {
        vim.toggleHelpOverlay()
        event.preventDefault()
        return
      }
    }

    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target as Element | null
      if (!target) return
      if (!isInputElement(target)) return
      if (isInsideRadixOverlay(target)) return
      useVimModeStore.getState().enterInsertMode()
    }

    const handleFocusOut = (event: FocusEvent): void => {
      const related = event.relatedTarget as Element | null
      if (related && isInputElement(related)) return
      const vim = useVimModeStore.getState()
      if (vim.mode !== 'insert') return
      vim.enterNormalMode()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('focusout', handleFocusOut, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('focusout', handleFocusOut, true)
    }
  }, [])
}
