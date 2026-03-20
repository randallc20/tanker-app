/**
 * Calculator — CJ4 Fuel Tankering Analysis
 *
 * Simple up front: distance, fuel prices, how much to carry.
 * Advanced details in progressive disclosure tabs.
 * Includes operating costs (engine, parts, maintenance) per Brian's feedback.
 */

import React, { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TankeringResult, CruiseMode } from '../data/types'
import { listAircraft, getAircraft } from '../data/aircraft_registry'
import { calculateTankering, sensitivitySweep } from '../engine/tankering_calc'
import { isaTemperature } from '../engine/temperature_correction'
import { useTheme, type Colors } from '../theme'

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

/* ─── PRESETS ───────────────────────────────────────────────────────────── */
const distPresets = [100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500]
const tankerPresets = [0, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800]
const pricePresets = (() => {
  const p: number[] = []
  for (let v = 3.0; v <= 12.0; v += 0.50) p.push(Math.round(v * 100) / 100)
  return p
})()
const weightPresets = [12000, 13000, 14000, 14500, 15000, 15500, 16000, 16500, 17000, 17110]
const windPresets = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]

/* ─── UI HELPERS ────────────────────────────────────────────────────────── */
function inp(c: Colors): React.CSSProperties {
  return { width: '100%', background: c.input, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: c.text, outline: 'none' }
}
function sel(c: Colors): React.CSSProperties {
  return { ...inp(c), appearance: 'none', paddingRight: 28, cursor: 'pointer' }
}

function Combo({ label, id, value, onChange, presets, suffix, c }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  presets: (string | number)[]; suffix?: string; c: Colors
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: c.sub }}>{label}</label>
      <input id={id} list={`${id}-list`} type="text" inputMode="decimal"
        value={value} onChange={e => onChange(e.target.value)} style={inp(c)} autoComplete="off" />
      <datalist id={`${id}-list`}>
        {presets.map(p => <option key={p} value={String(p)}>{suffix ? `${p} ${suffix}` : String(p)}</option>)}
      </datalist>
    </div>
  )
}

function Field({ label, c, children }: { label: string; c: Colors; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: c.sub }}>{label}</label>
      {children}
    </div>
  )
}

function Tab({ label, active, onClick, c }: { label: string; active: boolean; onClick: () => void; c: Colors }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${active ? c.accent : c.border}`,
      background: active ? `${c.accent}15` : 'transparent',
      color: active ? c.accent : c.muted,
    }}>{label}</button>
  )
}

function ChartTooltip({ active, payload, c }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: c?.cardAlt || '#1e222c', border: `1px solid ${c?.border || '#2a2e3a'}`, borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
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
  const { colors: c } = useTheme()
  const acList = listAircraft()

  // ── Essentials (always visible) ──
  const [dist, setDist] = useState('500')
  const [pOrig, setPOrig] = useState('5.00')
  const [pDest, setPDest] = useState('7.00')
  const [tankerGal, setTankerGal] = useState('100')

  // ── Aircraft & Performance (advanced tab 1) ──
  const [aircraftId, setAircraftId] = useState('cj4_525c')
  const [mode, setMode] = useState<CruiseMode>('hsc')
  const [alt, setAlt] = useState(39000)
  const [weight, setWeight] = useState('15000')
  const [density, setDensity] = useState('6.7')

  // ── Weather (advanced tab 2) ──
  const [wind, setWind] = useState('0')
  const [tempSel, setTempSel] = useState('ISA')

  // ── Operating Costs (advanced tab 3) ──
  const [engineCost, setEngineCost] = useState('500')
  const [partsCost, setPartsCost] = useState('440')
  const [maintCost, setMaintCost] = useState('1000')

  // ── UI state ──
  const [advancedTab, setAdvancedTab] = useState<'none' | 'aircraft' | 'weather' | 'costs'>('none')
  const [sensType, setSensType] = useState<'priceDiff' | 'wind' | 'tankerAmount'>('tankerAmount')

  // ── Derived values ──
  const ac = getAircraft(aircraftId)
  const fd = parseFloat(density) || 6.7
  const distN = parseFloat(dist) || 0
  const weightN = parseFloat(weight) || 0
  const tankerN = parseFloat(tankerGal) || 0
  const windN = parseFloat(wind) || 0
  const origN = parseFloat(pOrig) || 0
  const destN = parseFloat(pDest) || 0
  const tLb = tankerN * fd
  const hourlyCost = (parseFloat(engineCost) || 0) + (parseFloat(partsCost) || 0) + (parseFloat(maintCost) || 0)

  const alts = ac ? (mode === 'hsc' ? ac.hsc : ac.lrc).altitudes.filter(a => a >= 21000) : []
  const maxTankGal = ac ? Math.min(ac.weights.mtow - weightN, ac.weights.maxFuel_lb) / fd : 0
  const priceDiff = destN - origN
  const overMTOW = ac ? (weightN + tLb) > ac.weights.mtow : false
  const isaT = isaTemperature(alt)
  const forecastTemp = tempSel === 'ISA' ? null : isaT + parseFloat(tempSel)

  // ── Auto-calculate ──
  const result: TankeringResult | null = useMemo(() => {
    if (!distN || !weightN || !origN || !destN) return null
    try {
      return calculateTankering({
        aircraftId, cruiseMode: mode, cruiseAltitude: alt,
        tripDistance: distN, plannedCruiseWeight: weightN,
        tankerAmount_lb: tLb, windComponent: windN,
        forecastTemp_c: forecastTemp, departureElevation: 0,
        originPrice: origN, destPrice: destN,
        fuelDensity: fd, descentDistance: 50,
      })
    } catch { return null }
  }, [aircraftId, mode, alt, distN, weightN, tLb, windN, forecastTemp, origN, destN, fd])

  // ── Also run HSC if user picked LRC (for comparison) ──
  const hscResult: TankeringResult | null = useMemo(() => {
    if (!distN || !weightN || !origN || !destN || mode === 'hsc') return null
    try {
      return calculateTankering({
        aircraftId, cruiseMode: 'hsc', cruiseAltitude: alt,
        tripDistance: distN, plannedCruiseWeight: weightN,
        tankerAmount_lb: tLb, windComponent: windN,
        forecastTemp_c: forecastTemp, departureElevation: 0,
        originPrice: origN, destPrice: destN,
        fuelDensity: fd, descentDistance: 50,
      })
    } catch { return null }
  }, [aircraftId, mode, alt, distN, weightN, tLb, windN, forecastTemp, origN, destN, fd])

  const sensData = useMemo(() => {
    if (!result) return []
    return sensitivitySweep({
      aircraftId, cruiseMode: mode, cruiseAltitude: alt,
      tripDistance: distN, plannedCruiseWeight: weightN,
      tankerAmount_lb: tLb, windComponent: windN,
      forecastTemp_c: forecastTemp, departureElevation: 0,
      originPrice: origN, destPrice: destN,
      fuelDensity: fd, descentDistance: 50,
    }, sensType, 40)
  }, [result, sensType, aircraftId, mode, alt, distN, weightN, tLb, windN, forecastTemp, origN, destN, fd])

  const r = result

  // Operating cost impact: extra time from carrying weight (heavier = slightly slower at HSC)
  const timeSavedMin = r && hscResult ? (r.cruiseTime_hrs - hscResult.cruiseTime_hrs) * 60 : 0
  const opCostDiff = r && hscResult ? (r.cruiseTime_hrs - hscResult.cruiseTime_hrs) * hourlyCost : 0

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 48px' }}>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Fuel Tankering Calculator</h1>
        <p style={{ fontSize: 14, color: c.muted, marginBottom: 24 }}>
          Should you carry extra fuel from a cheaper airport? Results update as you type.
        </p>

        {/* ═══ ESSENTIALS ═══ */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 24, marginBottom: 12 }}>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Combo label="Trip Distance (NM)" id="dist" value={dist} onChange={setDist} presets={distPresets} suffix="NM" c={c} />
            <div>
              <Combo label="Extra Fuel to Carry (gal)" id="tanker" value={tankerGal} onChange={setTankerGal}
                presets={tankerPresets.filter(g => g <= maxTankGal + 5 || g === 0)} suffix="gal" c={c} />
              <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
                = {fmt(tLb, 0)} lb &middot; max {fmt(maxTankGal, 0)} gal
              </div>
            </div>
          </div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Combo label="Fuel Price at Origin ($/gal)" id="porig" value={pOrig} onChange={setPOrig} presets={pricePresets} c={c} />
            <Combo label="Fuel Price at Destination ($/gal)" id="pdest" value={pDest} onChange={setPDest} presets={pricePresets} c={c} />
          </div>
        </div>

        {/* ═══ ADVANCED TABS ═══ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { k: 'aircraft' as const, l: 'Aircraft & Performance' },
            { k: 'weather' as const, l: 'Weather' },
            { k: 'costs' as const, l: 'Operating Costs' },
          ]).map(t => (
            <Tab key={t.k} label={t.l} active={advancedTab === t.k}
              onClick={() => setAdvancedTab(advancedTab === t.k ? 'none' : t.k)} c={c} />
          ))}
        </div>

        {advancedTab === 'aircraft' && (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <Field label="Aircraft" c={c}>
                <select style={sel(c)} value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
                  {acList.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                </select>
              </Field>
              <Field label="Cruise Mode" c={c}>
                <select style={sel(c)} value={mode} onChange={e => setMode(e.target.value as CruiseMode)}>
                  <option value="hsc">High Speed Cruise (HSC)</option>
                  <option value="lrc">Long Range Cruise (LRC)</option>
                </select>
              </Field>
            </div>
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Field label="Cruise Altitude" c={c}>
                <select style={sel(c)} value={alt} onChange={e => setAlt(+e.target.value)}>
                  {alts.map(a => <option key={a} value={a}>FL{a / 100} ({a.toLocaleString()} ft)</option>)}
                </select>
              </Field>
              <Combo label="Cruise Weight (lb)" id="weight" value={weight} onChange={setWeight} presets={weightPresets} suffix="lb" c={c} />
              <Combo label="Fuel Density (lb/gal)" id="density" value={density} onChange={setDensity} presets={[6.5, 6.6, 6.7, 6.75, 6.8, 6.9, 7.0]} suffix="lb/gal" c={c} />
            </div>
          </div>
        )}

        {advancedTab === 'weather' && (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Combo label="Wind Component (kt)" id="wind" value={wind} onChange={setWind} presets={windPresets} suffix="kt" c={c} />
              <Field label="Temperature" c={c}>
                <select style={sel(c)} value={tempSel} onChange={e => setTempSel(e.target.value)}>
                  <option value="ISA">ISA (standard: {isaT.toFixed(0)}°C)</option>
                  {['-20', '-15', '-10', '-5', '+5', '+10', '+15', '+20'].map(t => (
                    <option key={t} value={t}>ISA {t}°C</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}

        {advancedTab === 'costs' && (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Hourly operating costs beyond fuel. These affect the total cost comparison when flight time changes.
            </p>
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Combo label="Engine Program ($/hr)" id="engine" value={engineCost} onChange={setEngineCost} presets={[0, 250, 350, 500, 600, 750]} c={c} />
              <Combo label="Parts Program ($/hr)" id="parts" value={partsCost} onChange={setPartsCost} presets={[0, 200, 300, 440, 500, 600]} c={c} />
              <Combo label="Maintenance ($/hr)" id="maint" value={maintCost} onChange={setMaintCost} presets={[0, 500, 750, 1000, 1200, 1500]} c={c} />
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: c.sub }}>
              Total hourly operating cost: <strong style={{ color: c.text }}>${fmt(hourlyCost, 0)}/hr</strong>
            </div>
          </div>
        )}

        {/* ═══ DEFAULTS NOTE ═══ */}
        <p style={{ fontSize: 12, color: c.muted, marginBottom: 20, textAlign: 'center' }}>
          Defaults: CJ4 &middot; HSC &middot; FL390 &middot; 15,000 lb &middot; ISA &middot; No wind
          {overMTOW && <strong style={{ color: c.red }}> &middot; OVER MTOW</strong>}
        </p>

        {/* ═══ RESULTS ═══ */}
        {r && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Verdict */}
            <div style={{
              background: r.worthIt ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `2px solid ${r.worthIt ? c.green : c.red}`,
              borderRadius: 12, padding: '24px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
            }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: r.worthIt ? c.green : c.red, marginBottom: 4 }}>
                  {r.worthIt ? 'Yes — Tanker the Fuel' : 'No — Don\'t Tanker'}
                </h2>
                <p style={{ fontSize: 14, color: c.muted }}>
                  {r.worthIt
                    ? `You save $${fmt(r.grossSavings, 2)} on cheaper fuel and only burn $${fmt(r.penaltyCost, 2)} extra carrying it.`
                    : `The extra fuel burned ($${fmt(r.penaltyCost, 2)}) costs more than the price savings ($${fmt(r.grossSavings, 2)}).`}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: r.worthIt ? c.green : c.red }}>
                  {r.netSavings < 0 ? '-' : '+'}${fmt(Math.abs(r.netSavings), 2)}
                </div>
                <div style={{ fontSize: 12, color: c.muted }}>net fuel savings</div>
              </div>
            </div>

            {/* Key numbers */}
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Cheaper fuel savings', value: `$${fmt(r.grossSavings, 2)}`, color: c.green },
                { label: 'Extra burn cost', value: `$${fmt(r.penaltyCost, 2)}`, color: c.red },
                { label: 'Break-even price diff', value: `$${fmt(r.breakEvenPriceDiff, 2)}/gal`, color: c.sub },
              ].map(m => (
                <div key={m.label} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>{m.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Operating cost impact — show when LRC selected or when costs are set */}
            {mode === 'lrc' && hscResult && hourlyCost > 0 && (
              <div style={{ background: c.card, border: `1px solid ${c.amber}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: c.amber, marginBottom: 12 }}>LRC vs HSC — Total Cost Impact</h3>
                <p style={{ fontSize: 13, color: c.sub, lineHeight: 1.6, marginBottom: 12 }}>
                  Flying LRC instead of HSC adds <strong style={{ color: c.text }}>{fmt(timeSavedMin, 1)} minutes</strong> to
                  this trip. At ${fmt(hourlyCost, 0)}/hr in operating costs (engine, parts, maintenance),
                  that extra time costs <strong style={{ color: c.red }}>${fmt(Math.abs(opCostDiff), 2)}</strong>.
                </p>
                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>HSC fuel savings</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: c.green }}>${fmt(hscResult.netSavings, 2)}</p>
                    <p style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{fmt(hscResult.cruiseTime_hrs * 60, 0)} min flight</p>
                  </div>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>LRC fuel savings</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: c.accent }}>${fmt(r.netSavings, 2)}</p>
                    <p style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{fmt(r.cruiseTime_hrs * 60, 0)} min flight</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sensitivity chart */}
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: c.sub }}>What-If</h3>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([
                    { k: 'tankerAmount' as const, l: 'Amount' },
                    { k: 'priceDiff' as const, l: 'Price' },
                    { k: 'wind' as const, l: 'Wind' },
                  ]).map(s => (
                    <Tab key={s.k} label={s.l} active={sensType === s.k} onClick={() => setSensType(s.k)} c={c} />
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={sensData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
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
                    tickFormatter={v => `$${v.toFixed(0)}`} width={40} />
                  <RCTooltip content={<ChartTooltip c={c} />} />
                  <ReferenceLine y={0} stroke={c.muted} strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="netSavings" name="Net Savings" stroke={c.accent} strokeWidth={2} fill="url(#savGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Flight details — always visible but compact */}
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', fontSize: 13 }}>
                {[
                  ['Flight time', `${fmt(r.cruiseTime_hrs * 60, 0)} min`],
                  ['Speed', `${fmt(r.cruiseKtas, 0)} KTAS`],
                  ['Burn rate', `${fmt(r.ffHeavy, 0)} lb/hr`],
                  ['Extra burn', `${fmt(r.cruisePenalty_lb + r.climbPenalty_lb, 0)} lb`],
                  ['Penalty', `${fmt(r.penaltyPct, 1)}%`],
                ].map(([k, v]) => (
                  <span key={k} style={{ color: c.muted }}>
                    {k}: <strong style={{ color: c.text }}>{v}</strong>
                  </span>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 11, color: c.muted, textAlign: 'center' }}>
              {ac?.dataSource} ({ac?.dataRevision}) — For planning purposes only.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 600px) {
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-3 { grid-template-columns: 1fr !important; }
          .metrics-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
