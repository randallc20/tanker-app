import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import Calculator from './pages/Calculator'
import About from './pages/About'
import { ThemeProvider, useTheme } from './theme'
import './index.css'

function App() {
  const [page, setPage] = useState<'calc' | 'about'>('calc')
  const { theme, colors: c, toggle } = useTheme()

  return (
    <>
      <nav style={{
        background: theme === 'dark' ? '#0a0d14' : '#ffffff',
        borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center',
      }}>
        {[
          { key: 'calc' as const, label: 'Calculator' },
          { key: 'about' as const, label: 'Methodology' },
        ].map(t => (
          <button key={t.key} onClick={() => setPage(t.key)}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: 'none', borderBottom: '2px solid',
              borderBottomColor: page === t.key ? c.accent : 'transparent',
              background: 'transparent',
              color: page === t.key ? c.accent : c.muted,
              transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
        <button onClick={toggle} style={{
          marginLeft: 'auto', marginRight: 16, padding: '6px 14px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          border: `1px solid ${c.border}`, borderRadius: 8,
          background: c.card, color: c.sub,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </nav>
      {page === 'calc' ? <Calculator /> : <About />}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
