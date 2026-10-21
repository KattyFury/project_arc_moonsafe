// MoonSafe — language + display currency preference
// 'vi' = Vietnamese → show amounts in VND (₫)
// 'en' = English   → show amounts in USDC

import { useState, useCallback, createContext, useContext } from 'react'

export type AppLanguage = 'vi' | 'en'

const STORAGE_KEY = 'moonsafe_lang_v1'

function readLang(): AppLanguage {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'vi') return v
  } catch { /* ignore */ }
  // Default: Vietnamese
  return 'vi'
}

export function useLanguageState() {
  const [language, setLangState] = useState<AppLanguage>(readLang)

  const setLanguage = useCallback((lang: AppLanguage) => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* ignore */ }
    setLangState(lang)
  }, [])

  return { language, setLanguage }
}

// Context so all components share one instance
import type { ReactNode } from 'react'
import { createElement } from 'react'

interface LanguageCtx { language: AppLanguage; setLanguage: (l: AppLanguage) => void }
export const LanguageContext = createContext<LanguageCtx>({ language: 'vi', setLanguage: () => undefined })

export function LanguageProvider({ children, value }: { children: ReactNode; value: LanguageCtx }) {
  return createElement(LanguageContext.Provider, { value }, children)
}

export function useLanguage() {
  return useContext(LanguageContext)
}
