/**
 * Calculator — CJ4 Fuel Tankering Analysis
 *
 * Compact, professional EFB-style UI. Inputs on left, live results on right.
 * All data from Cessna CJ4 Flight Planning Guide with bilinear interpolation.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TankeringInputs, TankeringResult, CruiseMode } from '../data/types'
import { listAircraft, getAircraft } from '../data/aircraft_registry'
import { calculateTankering, sensitivitySweep } from '../engine/tankering_calc'
import { isaTemperature } from '../engine/temperature_correction'

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */
const t = {
  bg:      '#080b12',
  surface: '#0e1219',
  panel:   '#111820',
  raised:  '#161e2a',
  border:  '#1c2638',
  glow:    '#1a2540',
  input:   '#0a0e16',
  text:    '#e0e6f0',
  sub:     '#8899b2',
  dim:     '#4a5a72',
  amber:   '#f0a500',
  amberDim:'#705000',
  green:   '#00e070',
  greenDim:'#003820',
  red:     '#ff4060',
  redDim:  '#3a0a14',
  blue:    '#4db8ff',
  grid:    '#141c28',
}

const mono = "'Share Tech Mono', monospace"
const sans = "'Barlow Condensed', sans-serif"

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtN = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

const fmtD = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`
}

function Lbl({ children, tip }: { children: React.ReactNode; tip?: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  return (
    <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase', color: t.dim, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      {children}
      {tip && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <span ref={ref} style={{ cursor: 'help', color: t.amber, fontSize: 11 }}
            onMouseEnter={() => { if (ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.min(Math.max(r.left - 110, 8), window.innerWidth - 260) }) }; setShow(true) }}
            onMouseLeave={() => setShow(false)}>ⓘ</span>
          {show && <span style={{ position: 'fixed', zIndex: 99999, top: pos.top, left: pos.left, width: 240, background: t.raised, color: t.sub, border: `1px solid ${t.border}`, borderRadius: 4, padding: '8px 12px', fontSize: 11, lineHeight: 1.5, fontFamily: sans, fontWeight: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.7)', pointerEvents: 'none', letterSpacing: 0, textTransform: 'none' }}>{tip}</span>}
        </span>
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', background: t.input, border: `1px solid ${t.border}`, borderRadius: 4,
  padding: '7px 10px', fontFamily: mono, fontSize: 13, color: t.text, outline: 'none',
}
const sel: React.CSSProperties = { ...inp, appearance: 'none', paddingRight: 24 }

/* ═══════════════════════════════════════════════════════════════════════════
   STAT PILL — key metric display
   ═══════════════════════════════════════════════════════════════════════════ */
function Stat({ label, value, sub, color, large }: {
  label: string; value: string; sub?: string; color?: string; large?: boolean
}) {
  return (
    <div style={{ textAlign: 'center', padding: large ? '12px 8px' : '8px 6px' }}>
      <div style={{ fontFamily: sans, fontSize: 9, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: t.dim, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: large ? 28 : 16, fontWeight: 700, color: color || t.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 10, color: t.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   COLLAPSIBLE SECTION
   ═══════════════════════════════════════════════════════════════════════════ */
function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer',
        background: open ? t.raised : 'transparent', border: 'none',
        borderBottom: open ? `1px solid ${t.border}` : 'none',
      }}>
        <span style={{ fontSize: 8, color: t.amber, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: t.sub }}>{title}</span>
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART TOOLTIP
   ═══════════════════════════════════════════════════════════════════════════ */
function CTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: t.raised, border: `1px solid ${t.border}`, borderRadius: 4, padding: '6px 10px', fontSize: 11, fontFamily: mono }}>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? `$${p.value.toFixed(2)}` : p.value}</div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALCULATOR
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Calculator() {
  const acList = listAircraft()
  const [aircraftId, setAircraftId] = useState('cj4_525c')
  const [mode, setMode] = useState<CruiseMode>('hsc')
  const [alt, setAlt] = useState(39000)
  const [dist, setDist] = useState('500')
  const [weight, setWeight] = useState('15000')
  const [tankerGal, setTankerGal] = useState('100')
  const [wind, setWind] = useState('0')
  const [temp, setTemp] = useState('')
  const [pOrig, setPOrig] = useState('5.00')
  const [pDest, setPDest] = useState('7.00')
  const [density, setDensity] = useState('6.7')
  const [descDist, setDescDist] = useState('50')
  const [depElev, setDepElev] = useState('0')
  const [sensType, setSensType] = useState<'priceDiff' | 'wind' | 'tankerAmount'>('tankerAmount')
  const [result, setResult] = useState<TankeringResult | null>(null)
  const [errs, setErrs] = useState<Record<string, string>>({})

  const ac = getAircraft(aircraftId)
  const fd = parseFloat(density) || 6.7
  const tLb = (parseFloat(tankerGal) || 0) * fd
  const w = parseFloat(weight) || 0
  const alts = ac ? (mode === 'hsc' ? ac.hsc : ac.lrc).altitudes.filter(a => a >= 21000) : []
  const maxTankGal = ac ? Math.min(ac.weights.mtow - w, ac.weights.maxFuel_lb) / fd : 0
  const priceDiff = (parseFloat(pDest) || 0) - (parseFloat(pOrig) || 0)
  const overMTOW = ac ? (w + tLb) > ac.weights.mtow : false

  const run = useCallback(() => {
    const e: Record<string, string> = {}
    if (!parseFloat(dist)) e.dist = 'Required'
    if (!w) e.weight = 'Required'
    if (!parseFloat(pOrig)) e.pOrig = 'Required'
    if (!parseFloat(pDest)) e.pDest = 'Required'
    setErrs(e)
    if (Object.keys(e).length) { setResult(null); return }
    setResult(calculateTankering({
      aircraftId, cruiseMode: mode, cruiseAltitude: alt,
      tripDistance: parseFloat(dist), plannedCruiseWeight: w,
      tankerAmount_lb: tLb, windComponent: parseFloat(wind) || 0,
      forecastTemp_c: temp ? parseFloat(temp) : null,
      departureElevation: parseFloat(depElev) || 0,
      originPrice: parseFloat(pOrig), destPrice: parseFloat(pDest),
      fuelDensity: fd, descentDistance: parseFloat(descDist) || 50,
    }))
  }, [aircraftId, mode, alt, dist, w, tLb, wind, temp, depElev, pOrig, pDest, fd, descDist])

  const sensData = useMemo(() => {
    if (!result) return []
    return sensitivitySweep({
      aircraftId, cruiseMode: mode, cruiseAltitude: alt,
      tripDistance: parseFloat(dist) || 500, plannedCruiseWeight: w,
      tankerAmount_lb: tLb, windComponent: parseFloat(wind) || 0,
      forecastTemp_c: temp ? parseFloat(temp) : null,
      departureElevation: parseFloat(depElev) || 0,
      originPrice: parseFloat(pOrig) || 5, destPrice: parseFloat(pDest) || 7,
      fuelDensity: fd, descentDistance: parseFloat(descDist) || 50,
    }, sensType, 40)
  }, [result, sensType, aircraftId, mode, alt, dist, w, tLb, wind, temp, depElev, pOrig, pDest, fd, descDist])

  const r = result // alias
  const isaT = isaTemperature(alt)

  /* ─── RENDER ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: sans, color: t.text }}>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 5, color: t.amber }}>TANKERING</span>
          <span style={{ fontSize: 10, letterSpacing: 2, color: t.dim }}>CJ4 • POH DATA</span>
        </div>
        {ac && <span style={{ fontSize: 10, letterSpacing: 1.5, color: t.dim }}>{ac.dataSource}</span>}
      </div>

      {/* ═══ LIVE PRICE DIFF STRIP ═══ */}
      <div style={{ background: priceDiff > 0 ? 'rgba(0,224,112,0.06)' : priceDiff < 0 ? 'rgba(255,64,96,0.06)' : t.surface, borderBottom: `1px solid ${t.border}`, padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 16, fontFamily: mono, fontSize: 12 }}>
        <span style={{ color: t.dim }}>ORIGIN</span>
        <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>${parseFloat(pOrig) || 0}</span>
        <span style={{ color: priceDiff > 0 ? t.green : priceDiff < 0 ? t.red : t.dim, fontSize: 16 }}>→</span>
        <span style={{ color: t.dim }}>DEST</span>
        <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>${parseFloat(pDest) || 0}</span>
        <span style={{ color: t.dim, margin: '0 4px' }}>|</span>
        <span style={{ color: priceDiff > 0 ? t.green : priceDiff < 0 ? t.red : t.dim, fontWeight: 700, fontSize: 14 }}>
          {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)}/gal
        </span>
        {overMTOW && <span style={{ color: t.red, fontWeight: 700, marginLeft: 'auto', fontSize: 11, letterSpacing: 1.5 }}>⚠ OVER MTOW</span>}
      </div>

      {/* ═══ MAIN 2-COL LAYOUT ═══ */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px', display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}
        className="calc-layout">

        {/* ═══ LEFT: INPUTS ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Aircraft row */}
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <Lbl>Aircraft</Lbl>
                <select style={sel} value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
                  {acList.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Altitude</Lbl>
                <select style={sel} value={alt} onChange={e => setAlt(+e.target.value)}>
                  {alts.map(a => <option key={a} value={a}>FL{a / 100}</option>)}
                </select>
              </div>
            </div>
            {/* Cruise mode toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(['hsc', 'lrc'] as CruiseMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '8px 0', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s', border: 'none',
                  background: mode === m ? (m === 'hsc' ? 'rgba(77,184,255,0.12)' : 'rgba(240,165,0,0.12)') : t.surface,
                  color: mode === m ? (m === 'hsc' ? t.blue : t.amber) : t.dim,
                  boxShadow: mode === m ? `inset 0 -2px 0 ${m === 'hsc' ? t.blue : t.amber}` : 'none',
                }}>
                  {m === 'hsc' ? '⚡ HIGH SPEED' : '🏁 LONG RANGE'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: t.dim, lineHeight: 1.4 }}>
              {mode === 'hsc'
                ? 'HSC: Max cruise thrust. Fuel flow barely changes with weight — low tankering penalty.'
                : 'LRC: Optimized for range. Fuel flow rises steeply with weight — tankering penalty is significant.'}
            </div>
          </div>

          {/* Trip & Weight */}
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Lbl>Distance (NM)</Lbl>
                <input style={{ ...inp, borderColor: errs.dist ? t.red : t.border }} type="number" value={dist} onChange={e => setDist(e.target.value)} />
              </div>
              <div>
                <Lbl tip="Aircraft weight at start of cruise, including passengers, bags, and trip fuel.">Cruise Weight (lb)</Lbl>
                <input style={{ ...inp, borderColor: errs.weight ? t.red : t.border }} type="number" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <Lbl tip={`Max tankerable: ${fmtN(maxTankGal, 0)} gal. Limited by MTOW and tank capacity.`}>
                Tanker Amount (gal)
              </Lbl>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...inp, flex: 1 }} type="number" value={tankerGal} onChange={e => setTankerGal(e.target.value)} />
                <span style={{ fontFamily: mono, fontSize: 11, color: t.dim, whiteSpace: 'nowrap' }}>= {fmtN(tLb, 0)} lb</span>
              </div>
              {/* Tanker slider */}
              <input type="range" min={0} max={Math.max(1, maxTankGal)} step={5} value={parseFloat(tankerGal) || 0}
                onChange={e => setTankerGal(e.target.value)}
                style={{ width: '100%', marginTop: 6, accentColor: t.amber, cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: t.dim, fontFamily: mono, marginTop: 2 }}>
                <span>0 gal</span>
                <span>{fmtN(maxTankGal, 0)} gal max</span>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Lbl>Origin ($/gal)</Lbl>
                <input style={{ ...inp, borderColor: errs.pOrig ? t.red : t.border }} type="number" step="0.01" value={pOrig} onChange={e => setPOrig(e.target.value)} />
              </div>
              <div>
                <Lbl>Dest ($/gal)</Lbl>
                <input style={{ ...inp, borderColor: errs.pDest ? t.red : t.border }} type="number" step="0.01" value={pDest} onChange={e => setPDest(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Weather */}
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Lbl tip="+kt = headwind, -kt = tailwind">Wind (kt)</Lbl>
                <input style={inp} type="number" value={wind} onChange={e => setWind(e.target.value)} />
              </div>
              <div>
                <Lbl tip={`ISA at FL${alt/100}: ${isaT.toFixed(1)}°C. Blank = ISA.`}>Temp (°C)</Lbl>
                <input style={inp} type="number" value={temp} onChange={e => setTemp(e.target.value)} placeholder={`${isaT.toFixed(0)}°`} />
              </div>
            </div>
          </div>

          {/* Advanced */}
          <Section title="Advanced">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Lbl>Fuel Density (lb/gal)</Lbl>
                <input style={inp} type="number" step="0.01" value={density} onChange={e => setDensity(e.target.value)} />
              </div>
              <div>
                <Lbl>Descent Dist (NM)</Lbl>
                <input style={inp} type="number" value={descDist} onChange={e => setDescDist(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <Lbl>Departure Elev (ft)</Lbl>
              <input style={inp} type="number" value={depElev} onChange={e => setDepElev(e.target.value)} />
            </div>
          </Section>

          {/* RUN */}
          <button onClick={run} style={{
            width: '100%', padding: '14px 0', borderRadius: 6, fontSize: 15, fontWeight: 700,
            letterSpacing: 4, textTransform: 'uppercase', cursor: 'pointer', border: `2px solid ${t.green}`,
            background: `linear-gradient(180deg, rgba(0,224,112,0.1), rgba(0,224,112,0.03))`,
            color: t.green, fontFamily: sans, transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 30px rgba(0,224,112,0.25)`)}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            ▶ ANALYZE
          </button>

          {/* Warnings */}
          {r && r.warnings.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 6, padding: '10px 14px' }}>
              {r.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: mono, color: t.amber, marginBottom: 2 }}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: RESULTS ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!r ? (
            /* Empty state */
            <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.15 }}>⛽</div>
              <div style={{ fontSize: 13, color: t.dim, letterSpacing: 2 }}>ENTER PARAMETERS AND HIT ANALYZE</div>
            </div>
          ) : (
            <>
              {/* ═══ VERDICT ═══ */}
              <div style={{
                background: r.worthIt
                  ? `linear-gradient(135deg, rgba(0,224,112,0.08), rgba(0,224,112,0.02))`
                  : `linear-gradient(135deg, rgba(255,64,96,0.08), rgba(255,64,96,0.02))`,
                border: `2px solid ${r.worthIt ? t.green : t.red}`,
                borderRadius: 8, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, color: r.worthIt ? t.green : t.red }}>
                    {r.worthIt ? '✓ TANKER' : '✗ DO NOT TANKER'}
                  </div>
                  <div style={{ fontSize: 11, letterSpacing: 1.5, color: r.worthIt ? 'rgba(0,224,112,0.6)' : 'rgba(255,64,96,0.6)', marginTop: 2 }}>
                    {r.worthIt ? 'Price savings exceed burn penalty' : 'Burn penalty exceeds price savings'}
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 36, fontWeight: 700, color: r.worthIt ? t.green : t.red }}>
                  {r.netSavings < 0 ? '-' : ''}${fmtN(Math.abs(r.netSavings), 2)}
                </div>
              </div>

              {/* ═══ KEY METRICS ROW ═══ */}
              <div style={{
                background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              }}>
                <Stat label="Gross Savings" value={`$${fmtN(r.grossSavings, 2)}`} color={t.green} />
                <Stat label="Penalty Cost" value={`$${fmtN(r.penaltyCost, 2)}`} color={t.red} />
                <Stat label="Penalty %" value={`${fmtN(r.penaltyPct, 1)}%`} color={t.amber} />
                <Stat label="Break-Even" value={`$${fmtN(r.breakEvenPriceDiff, 2)}/gal`} color={t.sub} />
              </div>

              {/* ═══ FUEL FLOW COMPARISON ═══ */}
              <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: t.dim, textTransform: 'uppercase', marginBottom: 4 }}>Normal Weight</div>
                    <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: t.sub }}>{fmtN(r.ffNormal, 0)}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: t.dim }}>lb/hr</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: r.ffDelta > 0 ? t.amber : t.green }}>
                      {r.ffDelta >= 0 ? '+' : ''}{fmtN(r.ffDelta, 1)}
                    </div>
                    <div style={{ fontSize: 9, color: t.dim }}>Δ lb/hr</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: t.dim, textTransform: 'uppercase', marginBottom: 4 }}>Tankered Weight</div>
                    <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: t.text }}>{fmtN(r.ffHeavy, 0)}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: t.dim }}>lb/hr</div>
                  </div>
                </div>
                {/* Penalty bar */}
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: t.surface, borderRadius: 4, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: t.dim }}>Cruise penalty</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: t.text }}>{fmtN(r.cruisePenalty_lb, 1)} lb</span>
                  </div>
                  <div style={{ background: t.surface, borderRadius: 4, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: t.dim }}>Climb penalty</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: t.text }}>{fmtN(r.climbPenalty_lb, 1)} lb</span>
                  </div>
                </div>
              </div>

              {/* ═══ SENSITIVITY CHART ═══ */}
              <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 6, padding: '12px 14px 8px' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {([
                    { k: 'tankerAmount' as const, l: 'AMOUNT' },
                    { k: 'priceDiff' as const, l: 'PRICE' },
                    { k: 'wind' as const, l: 'WIND' },
                  ]).map(s => (
                    <button key={s.k} onClick={() => setSensType(s.k)} style={{
                      padding: '4px 10px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                      letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                      background: sensType === s.k ? 'rgba(240,165,0,0.12)' : 'transparent',
                      color: sensType === s.k ? t.amber : t.dim,
                    }}>{s.l}</button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={sensData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.green} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={t.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                    <XAxis dataKey="x" tick={{ fill: t.dim, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false}
                      tickFormatter={v => sensType === 'priceDiff' ? `$${v.toFixed(1)}` : sensType === 'wind' ? `${v}kt` : `${v.toFixed(0)}g`} />
                    <YAxis tick={{ fill: t.dim, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false}
                      tickFormatter={v => fmtD(v)} />
                    <RCTooltip content={<CTip />} />
                    <ReferenceLine y={0} stroke={t.border} strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="netSavings" name="Net Savings" stroke={t.amber} strokeWidth={2} fill="url(#savGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ═══ TRIP DETAILS (collapsed) ═══ */}
              <Section title="Trip Details">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  {[
                    ['Cruise NM', `${fmtN(r.effectiveCruiseNM, 0)} NM`],
                    ['Cruise Time', `${fmtN(r.cruiseTime_hrs * 60, 0)} min`],
                    ['KTAS', `${fmtN(r.cruiseKtas, 0)} kt`],
                    ['Wind Factor', `×${fmtN(r.windCorrectionFactor, 3)}`],
                    ['Climb Dist', `${fmtN(r.climbDistanceHeavy, 0)} NM`],
                    ['Climb Fuel (normal)', `${fmtN(r.climbFuelNormal, 0)} lb`],
                    ['Climb Fuel (heavy)', `${fmtN(r.climbFuelHeavy, 0)} lb`],
                    ...(r.isaDeviation !== null ? [
                      ['ISA Dev', `${r.isaDeviation >= 0 ? '+' : ''}${fmtN(r.isaDeviation, 1)}°C`],
                      ['Temp Factor', `×${fmtN(r.isaTempCorrection, 4)}`],
                    ] : []),
                  ].map(([k, v], i) => (
                    <div key={i} style={{ background: i % 2 === 0 ? t.surface : 'transparent', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', borderRadius: 3 }}>
                      <span style={{ fontSize: 10, color: t.dim }}>{k}</span>
                      <span style={{ fontFamily: mono, fontSize: 11, color: t.text }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ═══ RULE OF THUMB (collapsed) ═══ */}
              {r.ruleOfThumb && (
                <Section title="vs Rule of Thumb (150 gal/hr)">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: t.surface, borderRadius: 4, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: t.dim, textTransform: 'uppercase', marginBottom: 4 }}>Flat Model</div>
                      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: t.sub }}>${fmtN(r.ruleOfThumb.netSavings, 2)}</div>
                      <div style={{ fontSize: 9, color: t.dim, marginTop: 2 }}>Penalty: $0 (no weight sensitivity)</div>
                    </div>
                    <div style={{ background: t.surface, border: `1px solid ${t.amber}`, borderRadius: 4, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: t.amber, textTransform: 'uppercase', marginBottom: 4 }}>POH Data</div>
                      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: t.amber }}>${fmtN(r.netSavings, 2)}</div>
                      <div style={{ fontSize: 9, color: t.dim, marginTop: 2 }}>Penalty: ${fmtN(r.penaltyCost, 2)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: t.dim, marginTop: 8, lineHeight: 1.5 }}>
                    The 150 gal/hr rule uses a flat fuel flow that ignores weight — it always shows zero burn penalty.
                    {r.ffDelta > 5
                      ? ' At LRC, actual fuel flow changes significantly with weight — the flat model overstates savings.'
                      : ' At HSC, weight sensitivity is negligible, so both models converge.'}
                  </div>
                </Section>
              )}

              {/* ═══ DATA BADGE ═══ */}
              <div style={{ fontSize: 9, fontFamily: mono, color: t.dim, textAlign: 'center', padding: '8px 0', letterSpacing: 0.5 }}>
                {ac?.dataSource} ({ac?.dataRevision}) • FOR PLANNING PURPOSES ONLY
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ RESPONSIVE ═══ */}
      <style>{`
        @media (max-width: 800px) {
          .calc-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
