/**
 * Calculator — CJ4 Fuel Tankering Analysis
 *
 * Combo inputs: dropdown presets you can click OR type custom values.
 * Results auto-calculate on every change. Supports light/dark theme.
 * Data from Cessna CJ4 Flight Planning Guide with bilinear interpolation.
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

/* ─── PRESET OPTIONS ────────────────────────────────────────────────────── */
const distPresets = [100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500]
const weightPresets = [12000, 13000, 14000, 14500, 15000, 15500, 16000, 16500, 17000, 17110]
const tankerPresets = [0, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800]
const pricePresets = (() => {
  const p: number[] = []
  for (let v = 3.0; v <= 12.0; v += 0.50) p.push(Math.round(v * 100) / 100)
  return p
})()
const windPresets = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]
const densityPresets = [6.5, 6.6, 6.7, 6.75, 6.8, 6.9, 7.0]

/* ─── STYLED HELPERS (theme-aware) ──────────────────────────────────────── */
function inputStyle(c: Colors): React.CSSProperties {
  return {
    width: '100%', background: c.input, border: `1px solid ${c.border}`, borderRadius: 8,
    padding: '10px 12px', fontSize: 14, color: c.text, outline: 'none',
  }
}
function selectStyle(c: Colors): React.CSSProperties {
  return { ...inputStyle(c), appearance: 'none', paddingRight: 28, cursor: 'pointer' }
}

function ComboField({ label, id, value, onChange, presets, suffix, c }: {
  label: string; id: string; value: string;
  onChange: (v: string) => void; presets: (string | number)[];
  suffix?: string; c: Colors
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: c.sub }}>
        {label}
      </label>
      <input id={id} list={`${id}-list`} type="text" inputMode="decimal"
        value={value} onChange={e => onChange(e.target.value)}
        style={inputStyle(c)} autoComplete="off" />
      <datalist id={`${id}-list`}>
        {presets.map(p => (
          <option key={p} value={String(p)}>{suffix ? `${p} ${suffix}` : String(p)}</option>
        ))}
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

function Collapsible({ title, c, children, defaultOpen = false }: {
  title: string; c: Colors; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
        borderBottom: open ? `1px solid ${c.border}` : 'none',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.sub }}>{title}</span>
        <span style={{ fontSize: 12, color: c.muted, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {open && <div style={{ padding: 20 }}>{children}</div>}
    </div>
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
  const [aircraftId, setAircraftId] = useState('cj4_525c')
  const [mode, setMode] = useState<CruiseMode>('hsc')
  const [alt, setAlt] = useState(39000)
  const [dist, setDist] = useState('500')
  const [weight, setWeight] = useState('15000')
  const [tankerGal, setTankerGal] = useState('100')
  const [wind, setWind] = useState('0')
  const [tempSel, setTempSel] = useState('ISA')
  const [pOrig, setPOrig] = useState('5.00')
  const [pDest, setPDest] = useState('7.00')
  const [density, setDensity] = useState('6.7')
  const [sensType, setSensType] = useState<'priceDiff' | 'wind' | 'tankerAmount'>('tankerAmount')

  const ac = getAircraft(aircraftId)
  const fd = parseFloat(density) || 6.7
  const distN = parseFloat(dist) || 0
  const weightN = parseFloat(weight) || 0
  const tankerN = parseFloat(tankerGal) || 0
  const windN = parseFloat(wind) || 0
  const origN = parseFloat(pOrig) || 0
  const destN = parseFloat(pDest) || 0
  const tLb = tankerN * fd

  const alts = ac ? (mode === 'hsc' ? ac.hsc : ac.lrc).altitudes.filter(a => a >= 21000) : []
  const maxTankGal = ac ? Math.min(ac.weights.mtow - weightN, ac.weights.maxFuel_lb) / fd : 0
  const priceDiff = destN - origN
  const overMTOW = ac ? (weightN + tLb) > ac.weights.mtow : false
  const isaT = isaTemperature(alt)
  const forecastTemp = tempSel === 'ISA' ? null : isaT + parseFloat(tempSel)

  const result: TankeringResult | null = useMemo(() => {
    if (!distN || !weightN || !origN || !destN) return null
    try {
      return calculateTankering({
        aircraftId, cruiseMode: mode, cruiseAltitude: alt,
        tripDistance: distN, plannedCruiseWeight: weightN,
        tankerAmount_lb: tLb, windComponent: windN,
        forecastTemp_c: forecastTemp,
        departureElevation: 0,
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
      forecastTemp_c: forecastTemp,
      departureElevation: 0,
      originPrice: origN, destPrice: destN,
      fuelDensity: fd, descentDistance: 50,
    }, sensType, 40)
  }, [result, sensType, aircraftId, mode, alt, distN, weightN, tLb, windN, forecastTemp, origN, destN, fd])

  const r = result

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 48px' }}>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: c.text }}>Fuel Tankering Calculator</h1>
        <p style={{ fontSize: 14, color: c.muted, marginBottom: 20 }}>
          Should you carry extra fuel from a cheaper airport? Pick a preset or type your own values.
        </p>

        {/* ═══ HOW IT WORKS ═══ */}
        <Collapsible title="How This Calculator Works" c={c} defaultOpen={false}>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: c.sub }}>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: c.text }}>What is tankering?</strong> Fuel prices vary between airports.
              If fuel is cheaper where you are now, you can fill up extra and carry it to your destination instead
              of buying expensive fuel there. The tradeoff: extra weight means your engines burn more fuel en route.
              This tool calculates whether the money you save on cheaper fuel exceeds the cost of that extra burn.
            </p>

            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: c.text }}>How we calculate it:</strong> We look up your aircraft's actual
              fuel burn rate from the POH (Pilot's Operating Handbook) at two weights — your normal cruise weight
              and your heavier weight with the extra fuel. The difference in fuel burn, multiplied by your flight
              time, gives us the <strong style={{ color: c.text }}>burn penalty</strong> — how much extra fuel
              you'll use carrying the weight. We then compare the cost of that penalty against the money you'd
              save by buying cheaper fuel at your origin.
            </p>

            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: c.text }}>Why not just use a rule of thumb?</strong> Many operators estimate
              a flat 3-5% burn penalty, but the real number depends heavily on your cruise mode. At{' '}
              <strong style={{ color: c.text }}>High Speed Cruise</strong>, the engines run at max thrust regardless
              of weight — a heavier plane just goes slightly slower but burns nearly the same fuel. The penalty
              is almost zero. At <strong style={{ color: c.text }}>Long Range Cruise</strong>, the engines throttle
              back to save fuel, so heavier weight means significantly more thrust and fuel burn. The penalty can
              be substantial. A flat percentage misses this entirely.
            </p>

            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: c.text }}>What data do we use?</strong> All performance numbers come from
              the Cessna CJ4 Flight Planning Guide (September 2012). The tool has fuel burn tables at 6 different
              weights and 16 altitudes for both HSC and LRC modes. Your exact weight and altitude are interpolated
              between these table values for a smooth, accurate estimate. Wind and temperature corrections are
              also applied from POH tables.
            </p>

            <p style={{ color: c.accent }}>
              This tool is for planning purposes only. Always verify with your current approved AFM/POH data.
            </p>
          </div>
        </Collapsible>

        <div style={{ height: 16 }} />

        {/* ═══ INPUTS ═══ */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Field label="Aircraft" c={c}>
              <select style={selectStyle(c)} value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
                {acList.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </Field>
            <Field label="Cruise Altitude" c={c}>
              <select style={selectStyle(c)} value={alt} onChange={e => setAlt(+e.target.value)}>
                {alts.map(a => <option key={a} value={a}>FL{a / 100} ({a.toLocaleString()} ft)</option>)}
              </select>
            </Field>
            <Field label="Cruise Mode" c={c}>
              <select style={selectStyle(c)} value={mode} onChange={e => setMode(e.target.value as CruiseMode)}>
                <option value="hsc">High Speed Cruise (HSC)</option>
                <option value="lrc">Long Range Cruise (LRC)</option>
              </select>
            </Field>
          </div>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ComboField label="Trip Distance (NM)" id="dist" value={dist} onChange={setDist} presets={distPresets} suffix="NM" c={c} />
            <ComboField label="Cruise Weight (lb)" id="weight" value={weight} onChange={setWeight} presets={weightPresets} suffix="lb" c={c} />
            <div>
              <ComboField label="Extra Fuel to Carry (gal)" id="tanker" value={tankerGal} onChange={setTankerGal}
                presets={tankerPresets.filter(g => g <= maxTankGal + 5 || g === 0)} suffix="gal" c={c} />
              <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
                = {fmt(tLb, 0)} lb &middot; max {fmt(maxTankGal, 0)} gal
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ComboField label="Fuel Price at Origin ($/gal)" id="porig" value={pOrig} onChange={setPOrig} presets={pricePresets} c={c} />
            <ComboField label="Fuel Price at Destination ($/gal)" id="pdest" value={pDest} onChange={setPDest} presets={pricePresets} c={c} />
          </div>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <ComboField label="Wind Component (kt)" id="wind" value={wind} onChange={setWind} presets={windPresets} suffix="kt" c={c} />
            <Field label="Temperature" c={c}>
              <select style={selectStyle(c)} value={tempSel} onChange={e => setTempSel(e.target.value)}>
                <option value="ISA">ISA (standard: {isaT.toFixed(0)}°C)</option>
                {['-20', '-15', '-10', '-5', '+5', '+10', '+15', '+20'].map(t => (
                  <option key={t} value={t}>ISA {t}°C</option>
                ))}
              </select>
            </Field>
            <ComboField label="Fuel Density (lb/gal)" id="density" value={density} onChange={setDensity} presets={densityPresets} suffix="lb/gal" c={c} />
          </div>
        </div>

        {/* ═══ SUMMARY BAR ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 24, flexWrap: 'wrap', fontSize: 14, color: c.sub }}>
          <span>Carrying <strong style={{ color: c.text }}>{tankerN} gal</strong> ({fmt(tLb, 0)} lb) extra</span>
          <span>
            Price diff: <strong style={{ color: priceDiff > 0 ? c.green : priceDiff < 0 ? c.red : c.muted }}>
              {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)}/gal
            </strong>
          </span>
          <span>Mode: <strong style={{ color: c.text }}>{mode === 'hsc' ? 'High Speed' : 'Long Range'}</strong></span>
          {overMTOW && <strong style={{ color: c.red }}>Over MTOW!</strong>}
        </div>

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
                <div style={{ fontSize: 12, color: c.muted }}>net savings</div>
              </div>
            </div>

            {/* Key metrics */}
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Savings from cheaper fuel', value: `$${fmt(r.grossSavings, 2)}`, color: c.green },
                { label: 'Cost of extra burn', value: `$${fmt(r.penaltyCost, 2)}`, color: c.red },
                { label: 'Fuel penalty', value: `${fmt(r.penaltyPct, 1)}%`, color: c.amber },
                { label: 'Break-even price diff', value: `$${fmt(r.breakEvenPriceDiff, 2)}/gal`, color: c.sub },
              ].map(m => (
                <div key={m.label} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 18, textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: c.muted, marginBottom: 8 }}>{m.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Fuel flow + Chart */}
            <div className="results-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: c.sub, marginBottom: 16 }}>Fuel Burn Comparison</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>Without extra fuel</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: c.sub }}>{fmt(r.ffNormal, 0)}</p>
                    <p style={{ fontSize: 12, color: c.muted }}>lb/hr</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: r.ffDelta > 0 ? c.amber : c.green }}>
                      {r.ffDelta >= 0 ? '+' : ''}{fmt(r.ffDelta, 1)}
                    </p>
                    <p style={{ fontSize: 11, color: c.muted }}>lb/hr</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>With extra fuel</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: c.text }}>{fmt(r.ffHeavy, 0)}</p>
                    <p style={{ fontSize: 12, color: c.muted }}>lb/hr</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: c.muted }}>Extra burn in cruise</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{fmt(r.cruisePenalty_lb, 1)} lb</span>
                  </div>
                  <div style={{ background: c.cardAlt, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: c.muted }}>Extra burn in climb</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{fmt(r.climbPenalty_lb, 1)} lb</span>
                  </div>
                </div>
              </div>

              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: c.sub }}>What-If Analysis</h3>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([
                      { k: 'tankerAmount' as const, l: 'Amount' },
                      { k: 'priceDiff' as const, l: 'Price' },
                      { k: 'wind' as const, l: 'Wind' },
                    ]).map(s => (
                      <button key={s.k} onClick={() => setSensType(s.k)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', border: `1px solid ${sensType === s.k ? c.accent : c.border}`,
                        background: sensType === s.k ? `${c.accent}18` : 'transparent',
                        color: sensType === s.k ? c.accent : c.muted,
                      }}>{s.l}</button>
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
            </div>

            {/* Trip Details */}
            <Collapsible title="Detailed Breakdown" c={c}>
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                {[
                  ['Cruise distance', `${fmt(r.effectiveCruiseNM, 0)} NM`],
                  ['Cruise time', `${fmt(r.cruiseTime_hrs * 60, 0)} min`],
                  ['Cruise speed', `${fmt(r.cruiseKtas, 0)} KTAS`],
                  ['Wind correction', `${fmt(r.windCorrectionFactor, 3)}x`],
                  ['Climb distance', `${fmt(r.climbDistanceHeavy, 0)} NM`],
                  ['Climb fuel (normal)', `${fmt(r.climbFuelNormal, 0)} lb`],
                  ['Climb fuel (heavy)', `${fmt(r.climbFuelHeavy, 0)} lb`],
                  ...(r.isaDeviation !== null ? [
                    ['ISA deviation', `${r.isaDeviation >= 0 ? '+' : ''}${fmt(r.isaDeviation, 1)}°C`],
                    ['Temp correction', `${fmt(r.isaTempCorrection, 4)}x`],
                  ] : []),
                ].map(([k, v], i) => (
                  <div key={i} style={{
                    background: i % 2 === 0 ? c.cardAlt : 'transparent',
                    padding: '8px 14px', borderRadius: 6, display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 13, color: c.muted }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{v}</span>
                  </div>
                ))}
              </div>
            </Collapsible>

            {r.ruleOfThumb && (
              <Collapsible title="vs. Simple 150 gal/hr Estimate" c={c}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div style={{ background: c.cardAlt, borderRadius: 10, padding: 18, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: c.muted, marginBottom: 6 }}>Simple Estimate</p>
                    <p style={{ fontSize: 24, fontWeight: 700, color: c.sub }}>${fmt(r.ruleOfThumb.netSavings, 2)}</p>
                    <p style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>Ignores weight penalty</p>
                  </div>
                  <div style={{ background: c.cardAlt, border: `1.5px solid ${c.accent}`, borderRadius: 10, padding: 18, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: c.accent, marginBottom: 6 }}>Actual (POH Data)</p>
                    <p style={{ fontSize: 24, fontWeight: 700, color: c.accent }}>${fmt(r.netSavings, 2)}</p>
                    <p style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>Includes ${fmt(r.penaltyCost, 2)} penalty</p>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.6 }}>
                  The simple 150 gal/hr estimate assumes fuel burn doesn't change with weight — so it never shows a penalty.
                  {r.ffDelta > 5
                    ? ' At Long Range Cruise, heavier weight significantly increases fuel burn, so the simple model overstates your savings.'
                    : ' At High Speed Cruise, weight barely affects fuel burn, so both models give similar results.'}
                </p>
              </Collapsible>
            )}

            <p style={{ fontSize: 12, color: c.muted, textAlign: 'center', paddingTop: 8 }}>
              {ac?.dataSource} ({ac?.dataRevision}) — For planning purposes only.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 700px) {
          .grid-3 { grid-template-columns: 1fr !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .metrics-grid { grid-template-columns: 1fr 1fr !important; }
          .results-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
