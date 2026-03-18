import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import Calculator from './pages/Calculator'
import About from './pages/About'
import './index.css'

function App() {
  const [page, setPage] = useState<'calc' | 'about'>('calc')

  return (
    <>
      {/* Nav tab bar */}
      <nav className="flex gap-0" style={{ background: '#0a0d14', borderBottom: '1px solid #1e2a3a' }}>
        {[
          { key: 'calc' as const, label: 'Calculator' },
          { key: 'about' as const, label: 'Methodology' },
        ].map(t => (
          <button key={t.key} onClick={() => setPage(t.key)}
            className="px-6 py-2.5 text-xs font-semibold tracking-[2px] uppercase cursor-pointer transition-all"
            style={{
              background: page === t.key ? '#141820' : 'transparent',
              color: page === t.key ? '#f0a500' : '#506880',
              borderBottom: page === t.key ? '2px solid #f0a500' : '2px solid transparent',
              border: 'none', borderBottomWidth: 2,
              borderBottomStyle: 'solid',
              borderBottomColor: page === t.key ? '#f0a500' : 'transparent',
            }}>
            {t.label}
          </button>
        ))}
      </nav>
      {page === 'calc' ? <Calculator /> : <About />}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
