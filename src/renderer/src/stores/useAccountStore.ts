import { create } from 'zustand'
import type { UsageProvider } from '@shared/types/usage'

interface AccountState {
  anthropicEmail: string | null
  openaiEmail: string | null
  fetchEmail: (provider: UsageProvider) => Promise<void>
}

export const useAccountStore = create<AccountState>()((set) => ({
  anthropicEmail: null,
  openaiEmail: null,
  fetchEmail: async (provider: UsageProvider) => {
    try {
      if (provider === 'anthropic') {
        const email = await window.accountOps.getClaudeEmail()
        set({ anthropicEmail: email })
      } else {
        const email = await window.accountOps.getOpenAIEmail()
        set({ openaiEmail: email })
      }
    } catch {
      // Swallow errors; IPC failures leave the slot at whatever it currently is,
      // and the handler itself returns null for any read failure.
      if (provider === 'anthropic') set({ anthropicEmail: null })
      else set({ openaiEmail: null })
    }
  }
}))
