/**
 * Calculator — CJ4 Fuel Tankering Analysis
 *
 * Clean, readable UI. Inputs on left, live results on right.
 * All data from Cessna CJ4 Flight Planning Guide with bilinear interpolation.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TankeringInputs, TankeringResult, CruiseMode } from '../data/types'
import { listAircraft, getAircraft } from '../data/aircraft_registry'
import { calculateTankering, sensitivitySweep } from '../engine/tankering_calc'
import { isaTemperature } from '../engine/temperature_correction'

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────── */
const c = {
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

/* ─── HELPERS ───────────────────────────────────────────────────────────── */
const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: c.sub }}>
      {children}
      {hint && <span style={{ marginLeft: 6, fontSize: 11, color: c.muted }} title={hint}>?</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: c.input, border: `1px solid ${c.border}`, borderRadius: 8,
  padding: '10px 12px', fontSize: 14, color: c.text, outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', paddingRight: 28 }

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  )
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 600, color: c.sub, marginBottom: 14 }}>{children}</h3>
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card style={{ padding: 0 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
        borderBottom: open ? `1px solid ${c.border}` : 'none',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.sub }}>{title}</span>
        <span style={{ fontSize: 12, color: c.muted, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {open && <div style={{ padding: 20 }}>{children}</div>}
    </Card>
  )
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: c.cardAlt, border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? `$${p.value.toFixed(2)}` : p.value}
        </div>
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

  const r = result
  const isaT = isaTemperature(alt)

  /* ─── RENDER ────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text }}>

      {/* Header */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text }}>Fuel Tankering Calculator</h1>
          <span style={{ fontSize: 13, color: c.muted }}>Citation CJ4</span>
        </div>
        <p style={{ fontSize: 13, color: c.muted, marginBottom: 20 }}>
          Uses actual POH performance data with bilinear interpolation — not flat percentage estimates.
        </p>

        {/* Price bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, background: c.card,
          border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 20px', marginBottom: 20, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: c.muted }}>Origin</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>${parseFloat(pOrig) || 0}/gal</span>
          <span style={{ fontSize: 18, color: c.muted }}>→</span>
          <span style={{ fontSize: 13, color: c.muted }}>Destination</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>${parseFloat(pDest) || 0}/gal</span>
          <span style={{
            marginLeft: 'auto', fontSize: 15, fontWeight: 700,
            color: priceDiff > 0 ? c.green : priceDiff < 0 ? c.red : c.muted,
          }}>
            {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)}/gal difference
          </span>
          {overMTOW && <span style={{ color: c.red, fontWeight: 600, fontSize: 13 }}>Over MTOW</span>}
        </div>
      </div>

      {/* Main layout */}
      <div className="calc-layout" style={{
        maxWidth: 1100, margin: '0 auto', padding: '0 20px 40px',
        display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start',
      }}>

        {/* ─── LEFT: INPUTS ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Aircraft & Mode */}
          <Card>
            <CardHeader>Aircraft & Cruise Mode</CardHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <Label>Aircraft</Label>
                <select style={selectStyle} value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
                  {acList.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                </select>
              </div>
              <div>
                <Label>Altitude</Label>
                <select style={selectStyle} value={alt} onChange={e => setAlt(+e.target.value)}>
                  {alts.map(a => <option key={a} value={a}>FL{a / 100}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['hsc', 'lrc'] as CruiseMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', border: `1.5px solid ${mode === m ? c.accent : c.border}`,
                  background: mode === m ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: mode === m ? c.accent : c.muted,
                }}>
                  {m === 'hsc' ? 'High Speed Cruise' : 'Long Range Cruise'}
                </button>
              ))}
            </div>
            <p style={{ marginTop: 8, fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
              {mode === 'hsc'
                ? 'At HSC, fuel flow barely changes with weight — tankering penalty is minimal.'
                : 'At LRC, fuel flow rises significantly with weight — tankering penalty can be substantial.'}
            </p>
          </Card>

          {/* Trip */}
          <Card>
            <CardHeader>Trip & Weight</CardHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <Label>Distance (NM)</Label>
                <input style={{ ...inputStyle, borderColor: errs.dist ? c.red : c.border }} type="number" value={dist} onChange={e => setDist(e.target.value)} />
              </div>
              <div>
                <Label hint="Weight at start of cruise, including pax, bags, and fuel.">Cruise Weight (lb)</Label>
                <input style={{ ...inputStyle, borderColor: errs.weight ? c.red : c.border }} type="number" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
            </div>
            <Label hint={`Max: ${fmt(maxTankGal, 0)} gal (limited by MTOW and tank capacity)`}>Tanker Amount (gal)</Label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }} type="number" value={tankerGal} onChange={e => setTankerGal(e.target.value)} />
              <span style={{ fontSize: 13, color: c.muted, whiteSpace: 'nowrap' }}>{fmt(tLb, 0)} lb</span>
            </div>
            <input type="range" min={0} max={Math.max(1, maxTankGal)} step={5}
              value={parseFloat(tankerGal) || 0} onChange={e => setTankerGal(e.target.value)}
              style={{ width: '100%', marginTop: 8, accentColor: c.accent, cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.muted, marginTop: 3 }}>
              <span>0 gal</span>
              <span>{fmt(maxTankGal, 0)} gal max</span>
            </div>
          </Card>

          {/* Fuel Prices */}
          <Card>
            <CardHeader>Fuel Prices</CardHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label>Origin ($/gal)</Label>
                <input style={{ ...inputStyle, borderColor: errs.pOrig ? c.red : c.border }} type="number" step="0.01" value={pOrig} onChange={e => setPOrig(e.target.value)} />
              </div>
              <div>
                <Label>Destination ($/gal)</Label>
                <input style={{ ...inputStyle, borderColor: errs.pDest ? c.red : c.border }} type="number" step="0.01" value={pDest} onChange={e => setPDest(e.target.value)} />
              </div>
            </div>
          </Card>

          {/* Weather */}
          <Card>
            <CardHeader>Weather</CardHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label hint="Positive = headwind, negative = tailwind">Wind Component (kt)</Label>
                <input style={inputStyle} type="number" value={wind} onChange={e => setWind(e.target.value)} />
              </div>
              <div>
                <Label hint={`ISA at FL${alt / 100}: ${isaT.toFixed(1)}°C. Leave blank for ISA.`}>Temperature (°C)</Label>
                <input style={inputStyle} type="number" value={temp} onChange={e => setTemp(e.target.value)} placeholder={`ISA: ${isaT.toFixed(0)}°`} />
              </div>
            </div>
          </Card>

          {/* Advanced */}
          <Collapsible title="Advanced Settings">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <Label>Fuel Density (lb/gal)</Label>
                <input style={inputStyle} type="number" step="0.01" value={density} onChange={e => setDensity(e.target.value)} />
              </div>
              <div>
                <Label>Descent Distance (NM)</Label>
                <input style={inputStyle} type="number" value={descDist} onChange={e => setDescDist(e.target.value)} />
              </div>
            </div>
            <Label>Departure Elevation (ft)</Label>
            <input style={inputStyle} type="number" value={depElev} onChange={e => setDepElev(e.target.value)} />
          </Collapsible>

          {/* Analyze button */}
          <button onClick={run} style={{
            width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', border: 'none',
            background: c.accent, color: '#fff', transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Analyze Tankering
          </button>

          {/* Warnings */}
          {r && r.warnings.length > 0 && (
            <Card style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
              {r.warnings.map((w, i) => (
                <p key={i} style={{ fontSize: 13, color: c.amber, marginBottom: i < r.warnings.length - 1 ? 6 : 0 }}>{w}</p>
              ))}
            </Card>
          )}
        </div>

        {/* ─── RIGHT: RESULTS ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!r ? (
            <Card style={{ padding: '80px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 40, marginBottom: 12, opacity: 0.12 }}>⛽</p>
              <p style={{ fontSize: 14, color: c.muted }}>Enter your parameters and click Analyze</p>
            </Card>
          ) : (
            <>
              {/* Verdict */}
              <Card style={{
                borderColor: r.worthIt ? c.green : c.red,
                background: r.worthIt
                  ? 'rgba(34,197,94,0.06)'
                  : 'rgba(239,68,68,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: r.worthIt ? c.green : c.red, marginBottom: 4 }}>
                      {r.worthIt ? 'Tanker — Save Money' : 'Do Not Tanker'}
                    </h2>
                    <p style={{ fontSize: 13, color: c.muted }}>
                      {r.worthIt ? 'Price savings exceed the burn penalty.' : 'The burn penalty exceeds price savings.'}
                    </p>
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: r.worthIt ? c.green : c.red }}>
                    {r.netSavings < 0 ? '-' : '+'}${fmt(Math.abs(r.netSavings), 2)}
                  </div>
                </div>
              </Card>

              {/* Key metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: 'Gross Savings', value: `$${fmt(r.grossSavings, 2)}`, color: c.green },
                  { label: 'Penalty Cost', value: `$${fmt(r.penaltyCost, 2)}`, color: c.red },
                  { label: 'Penalty %', value: `${fmt(r.penaltyPct, 1)}%`, color: c.amber },
                  { label: 'Break-Even Diff', value: `$${fmt(r.breakEvenPriceDiff, 2)}/gal`, color: c.sub },
                ].map(m => (
                  <Card key={m.label} style={{ textAlign: 'center', padding: 16 }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>{m.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</p>
                  </Card>
                ))}
              </div>

              {/* Fuel flow comparison */}
              <Card>
                <CardHeader>Fuel Flow Comparison</CardHeader>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>Normal Weight</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: c.sub }}>{fmt(r.ffNormal, 0)}</p>
                    <p style={{ fontSize: 12, color: c.muted }}>lb/hr</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 12px' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: r.ffDelta > 0 ? c.amber : c.green }}>
                      {r.ffDelta >= 0 ? '+' : ''}{fmt(r.ffDelta, 1)}
                    </p>
                    <p style={{ fontSize: 11, color: c.muted }}>lb/hr difference</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>With Tankering</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: c.text }}>{fmt(r.ffHeavy, 0)}</p>
                    <p style={{ fontSize: 12, color: c.muted }}>lb/hr</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: c.muted }}>Cruise penalty</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{fmt(r.cruisePenalty_lb, 1)} lb</span>
                  </div>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: c.muted }}>Climb penalty</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{fmt(r.climbPenalty_lb, 1)} lb</span>
                  </div>
                </div>
              </Card>

              {/* Sensitivity chart */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <CardHeader>Sensitivity Analysis</CardHeader>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([
                      { k: 'tankerAmount' as const, l: 'Amount' },
                      { k: 'priceDiff' as const, l: 'Price Diff' },
                      { k: 'wind' as const, l: 'Wind' },
                    ]).map(s => (
                      <button key={s.k} onClick={() => setSensType(s.k)} style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', border: `1px solid ${sensType === s.k ? c.accent : c.border}`,
                        background: sensType === s.k ? 'rgba(59,130,246,0.1)' : 'transparent',
                        color: sensType === s.k ? c.accent : c.muted,
                      }}>{s.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 600 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={sensData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                        <defs>
                          <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c.accent} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                        <XAxis dataKey="x" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={v => sensType === 'priceDiff' ? `$${v.toFixed(1)}` : sensType === 'wind' ? `${v}kt` : `${v.toFixed(0)}g`} />
                        <YAxis tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={v => `$${v.toFixed(0)}`} />
                        <RCTooltip content={<ChartTooltip />} />
                        <ReferenceLine y={0} stroke={c.muted} strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="netSavings" name="Net Savings" stroke={c.accent} strokeWidth={2} fill="url(#savGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Card>

              {/* Trip Details */}
              <Collapsible title="Trip Details">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {[
                    ['Cruise Distance', `${fmt(r.effectiveCruiseNM, 0)} NM`],
                    ['Cruise Time', `${fmt(r.cruiseTime_hrs * 60, 0)} min`],
                    ['Cruise Speed', `${fmt(r.cruiseKtas, 0)} KTAS`],
                    ['Wind Factor', `${fmt(r.windCorrectionFactor, 3)}x`],
                    ['Climb Dist', `${fmt(r.climbDistanceHeavy, 0)} NM`],
                    ['Climb Fuel (normal)', `${fmt(r.climbFuelNormal, 0)} lb`],
                    ['Climb Fuel (heavy)', `${fmt(r.climbFuelHeavy, 0)} lb`],
                    ...(r.isaDeviation !== null ? [
                      ['ISA Deviation', `${r.isaDeviation >= 0 ? '+' : ''}${fmt(r.isaDeviation, 1)}°C`],
                      ['Temp Factor', `${fmt(r.isaTempCorrection, 4)}x`],
                    ] : []),
                  ].map(([k, v], i) => (
                    <div key={i} style={{
                      background: i % 4 < 2 ? c.cardAlt : 'transparent',
                      padding: '8px 12px', borderRadius: 6,
                      display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 13, color: c.muted }}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>

              {/* Rule of Thumb */}
              {r.ruleOfThumb && (
                <Collapsible title="Comparison: Rule of Thumb (150 gal/hr)">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div style={{ background: c.cardAlt, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>Flat Model</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: c.sub }}>${fmt(r.ruleOfThumb.netSavings, 2)}</p>
                      <p style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>No weight sensitivity</p>
                    </div>
                    <div style={{ background: c.cardAlt, border: `1.5px solid ${c.accent}`, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: c.accent, marginBottom: 6 }}>POH Data</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: c.accent }}>${fmt(r.netSavings, 2)}</p>
                      <p style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>Penalty: ${fmt(r.penaltyCost, 2)}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
                    The 150 gal/hr rule uses a flat fuel flow with no weight sensitivity — it always shows zero burn penalty.
                    {r.ffDelta > 5
                      ? ' At LRC, actual fuel flow changes significantly with weight, so the flat model overstates savings.'
                      : ' At HSC, weight sensitivity is minimal, so both models give similar results.'}
                  </p>
                </Collapsible>
              )}

              {/* Footer */}
              <p style={{ fontSize: 11, color: c.muted, textAlign: 'center', padding: '8px 0' }}>
                {ac?.dataSource} ({ac?.dataRevision}) — For planning purposes only.
              </p>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 840px) {
          .calc-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
