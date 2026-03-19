import React, { createContext, useContext, useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

const dark = {
  bg:      '#0f1117',
  card:    '#181b23',
  cardAlt: '#1e222c',
  border:  '#2a2e3a',
  input:   '#13151d',
  text:    '#e8eaf0',
  sub:     '#9ca3b4',
  muted:   '#5c6478',
  accent:  '#3b82f6',
  green:   '#22c55e',
  red:     '#ef4444',
  amber:   '#f59e0b',
}

const light = {
  bg:      '#f5f6f8',
  card:    '#ffffff',
  cardAlt: '#f0f1f4',
  border:  '#d8dbe2',
  input:   '#ffffff',
  text:    '#1a1d24',
  sub:     '#4b5563',
  muted:   '#7b8494',
  accent:  '#2563eb',
  green:   '#16a34a',
  red:     '#dc2626',
  amber:   '#d97706',
}

export type Colors = typeof dark

const ThemeContext = createContext<{ theme: Theme; colors: Colors; toggle: () => void }>({
  theme: 'dark', colors: dark, toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('tanker-theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return 'dark'
  })

  useEffect(() => {
    try { localStorage.setItem('tanker-theme', theme) } catch {}
    document.body.style.background = theme === 'dark' ? dark.bg : light.bg
    document.body.style.color = theme === 'dark' ? dark.text : light.text
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const colors = theme === 'dark' ? dark : light

  return (
    <ThemeContext.Provider value={{ theme, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
