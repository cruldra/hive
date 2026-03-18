import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock stores — each vi.mock call provides a controllable getState()
// ---------------------------------------------------------------------------

const mockEnterNormalMode = vi.fn()
const mockEnterInsertMode = vi.fn()
const mockToggleHelpOverlay = vi.fn()
const mockSetHelpOverlayOpen = vi.fn()

const vimModeState = {
  mode: 'normal' as 'normal' | 'insert',
  helpOverlayOpen: false,
  enterNormalMode: mockEnterNormalMode,
  enterInsertMode: mockEnterInsertMode,
  toggleHelpOverlay: mockToggleHelpOverlay,
  setHelpOverlayOpen: mockSetHelpOverlayOpen
}

vi.mock('@/stores/useVimModeStore', () => ({
  useVimModeStore: {
    getState: () => vimModeState
  }
}))

const commandPaletteState = {
  isOpen: false
}

vi.mock('@/stores/useCommandPaletteStore', () => ({
  useCommandPaletteStore: {
    getState: () => commandPaletteState
  }
}))

const mockSetLeftSidebarCollapsed = vi.fn()
const mockSetRightSidebarCollapsed = vi.fn()
const mockSetBottomPanelTab = vi.fn()

const layoutState = {
  leftSidebarCollapsed: false,
  setLeftSidebarCollapsed: mockSetLeftSidebarCollapsed,
  rightSidebarCollapsed: false,
  setRightSidebarCollapsed: mockSetRightSidebarCollapsed,
  setBottomPanelTab: mockSetBottomPanelTab
}

vi.mock('@/stores/useLayoutStore', () => ({
  useLayoutStore: {
    getState: () => layoutState
  }
}))

const mockEnterPending = vi.fn()
const mockExitPending = vi.fn()

const hintState = {
  mode: 'idle' as 'idle' | 'pending',
  pendingChar: null as string | null,
  hintMap: new Map<string, string>(),
  sessionHintMap: new Map<string, string>(),
  sessionHintTargetMap: new Map<string, string>(),
  enterPending: mockEnterPending,
  exitPending: mockExitPending
}

vi.mock('@/stores/useHintStore', () => ({
  useHintStore: {
    getState: () => hintState
  }
}))

// ---------------------------------------------------------------------------
// Import the hook under test (does NOT exist yet — RED phase)
// ---------------------------------------------------------------------------
import { useVimNavigation } from '@/hooks/useVimNavigation'

// ---------------------------------------------------------------------------
// fireKey() helper — dispatches a KeyboardEvent on document and reports
// whether preventDefault() was called (i.e. the event was "consumed").
// ---------------------------------------------------------------------------
function fireKey(
  key: string,
  opts?: Partial<KeyboardEventInit>
): boolean {
  let defaultPrevented = false
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts
  })
  // Spy on preventDefault to detect consumption
  const origPreventDefault = event.preventDefault.bind(event)
  event.preventDefault = () => {
    defaultPrevented = true
    origPreventDefault()
  }
  document.dispatchEvent(event)
  return defaultPrevented
}

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------
describe('useVimNavigation', () => {
  beforeEach(() => {
    // Reset all mock functions
    vi.clearAllMocks()

    // Reset vim mode state to defaults
    vimModeState.mode = 'normal'
    vimModeState.helpOverlayOpen = false

    // Reset command palette state
    commandPaletteState.isOpen = false

    // Reset layout state
    layoutState.leftSidebarCollapsed = false
    layoutState.rightSidebarCollapsed = false

    // Reset hint state
    hintState.mode = 'idle'
    hintState.pendingChar = null
    hintState.hintMap = new Map()
    hintState.sessionHintMap = new Map()
    hintState.sessionHintTargetMap = new Map()
  })

  afterEach(() => {
    cleanup()
    // Remove any leftover Radix dialog elements
    document
      .querySelectorAll('[data-radix-dialog-content]')
      .forEach((el) => el.remove())
  })

  // =========================================================================
  // 2.2 — Guard condition tests
  // =========================================================================
  describe('guard conditions', () => {
    it('metaKey=true is not consumed (passes through)', () => {
      renderHook(() => useVimNavigation())
      const consumed = fireKey('j', { metaKey: true })
      expect(consumed).toBe(false)
    })

    it('ctrlKey=true is not consumed', () => {
      renderHook(() => useVimNavigation())
      const consumed = fireKey('j', { ctrlKey: true })
      expect(consumed).toBe(false)
    })

    it('altKey=true is not consumed', () => {
      renderHook(() => useVimNavigation())
      const consumed = fireKey('j', { altKey: true })
      expect(consumed).toBe(false)
    })

    it('insert mode + key !== Escape is not consumed', () => {
      vimModeState.mode = 'insert'
      renderHook(() => useVimNavigation())
      const consumed = fireKey('j')
      expect(consumed).toBe(false)
    })

    it('Radix dialog present means key is not consumed', () => {
      renderHook(() => useVimNavigation())
      const dialog = document.createElement('div')
      dialog.setAttribute('data-radix-dialog-content', '')
      document.body.appendChild(dialog)

      const consumed = fireKey('j')
      expect(consumed).toBe(false)
    })

    it('command palette open means key is not consumed', () => {
      commandPaletteState.isOpen = true
      renderHook(() => useVimNavigation())
      const consumed = fireKey('j')
      expect(consumed).toBe(false)
    })
  })

  // =========================================================================
  // 2.3 — Mode transition tests
  // =========================================================================
  describe('mode transitions', () => {
    it('Escape in insert mode calls enterNormalMode()', () => {
      vimModeState.mode = 'insert'
      renderHook(() => useVimNavigation())

      fireKey('Escape')

      expect(mockEnterNormalMode).toHaveBeenCalledTimes(1)
    })

    it('Escape in normal mode with helpOverlayOpen calls setHelpOverlayOpen(false)', () => {
      vimModeState.mode = 'normal'
      vimModeState.helpOverlayOpen = true
      renderHook(() => useVimNavigation())

      fireKey('Escape')

      expect(mockSetHelpOverlayOpen).toHaveBeenCalledWith(false)
    })

    it('Escape in normal mode without overlay does NOT preventDefault (propagates)', () => {
      vimModeState.mode = 'normal'
      vimModeState.helpOverlayOpen = false
      renderHook(() => useVimNavigation())

      const consumed = fireKey('Escape')

      expect(consumed).toBe(false)
    })

    it('I (Shift+I) in normal mode calls enterInsertMode, opens sidebar, dispatches focus event', () => {
      vi.useFakeTimers()
      layoutState.leftSidebarCollapsed = true
      renderHook(() => useVimNavigation())

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      fireKey('I', { shiftKey: true })

      expect(mockEnterInsertMode).toHaveBeenCalledTimes(1)
      expect(mockSetLeftSidebarCollapsed).toHaveBeenCalledWith(false)

      // Focus event is dispatched after a 100ms delay when sidebar was collapsed
      vi.advanceTimersByTime(100)

      const focusEvent = dispatchSpy.mock.calls.find(
        ([evt]) => evt instanceof Event && evt.type === 'hive:focus-project-filter'
      )
      expect(focusEvent).toBeDefined()

      dispatchSpy.mockRestore()
      vi.useRealTimers()
    })

    it('? toggles help overlay', () => {
      renderHook(() => useVimNavigation())

      fireKey('?')

      expect(mockToggleHelpOverlay).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // 2.4 — focusin / focusout tests
  // =========================================================================
  describe('focus tracking', () => {
    it('focusin on INPUT outside Radix calls enterInsertMode()', () => {
      renderHook(() => useVimNavigation())

      const input = document.createElement('input')
      document.body.appendChild(input)

      const event = new FocusEvent('focusin', {
        bubbles: true,
        relatedTarget: null
      })
      Object.defineProperty(event, 'target', { value: input })
      document.dispatchEvent(event)

      expect(mockEnterInsertMode).toHaveBeenCalledTimes(1)

      input.remove()
    })

    it('focusin on INPUT inside [data-radix-dialog-content] does NOT switch mode', () => {
      renderHook(() => useVimNavigation())

      const dialog = document.createElement('div')
      dialog.setAttribute('data-radix-dialog-content', '')
      const input = document.createElement('input')
      dialog.appendChild(input)
      document.body.appendChild(dialog)

      const event = new FocusEvent('focusin', {
        bubbles: true,
        relatedTarget: null
      })
      Object.defineProperty(event, 'target', { value: input })
      document.dispatchEvent(event)

      expect(mockEnterInsertMode).not.toHaveBeenCalled()

      dialog.remove()
    })

    it('focusin on INPUT inside [cmdk-root] does NOT switch mode', () => {
      renderHook(() => useVimNavigation())

      const cmdkRoot = document.createElement('div')
      cmdkRoot.setAttribute('cmdk-root', '')
      const input = document.createElement('input')
      cmdkRoot.appendChild(input)
      document.body.appendChild(cmdkRoot)

      const event = new FocusEvent('focusin', {
        bubbles: true,
        relatedTarget: null
      })
      Object.defineProperty(event, 'target', { value: input })
      document.dispatchEvent(event)

      expect(mockEnterInsertMode).not.toHaveBeenCalled()

      cmdkRoot.remove()
    })

    it('focusout where new activeElement is body calls enterNormalMode()', () => {
      vimModeState.mode = 'insert'
      renderHook(() => useVimNavigation())

      const input = document.createElement('input')
      document.body.appendChild(input)

      const event = new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: null
      })
      Object.defineProperty(event, 'target', { value: input })
      // After focusout with no relatedTarget, activeElement falls back to body
      document.dispatchEvent(event)

      expect(mockEnterNormalMode).toHaveBeenCalledTimes(1)

      input.remove()
    })

    it('focusout where new activeElement is another INPUT does NOT call enterNormalMode', () => {
      vimModeState.mode = 'insert'
      renderHook(() => useVimNavigation())

      const input1 = document.createElement('input')
      const input2 = document.createElement('input')
      document.body.appendChild(input1)
      document.body.appendChild(input2)

      const event = new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: input2
      })
      Object.defineProperty(event, 'target', { value: input1 })
      document.dispatchEvent(event)

      expect(mockEnterNormalMode).not.toHaveBeenCalled()

      input1.remove()
      input2.remove()
    })
  })
})
