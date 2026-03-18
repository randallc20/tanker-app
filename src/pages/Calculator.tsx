/**
 * Calculator Page — Main tankering analysis UI
 *
 * Professional EFB-style interface for the Citation CJ4 fuel tankering tool.
 * Uses actual POH data with bilinear interpolation, not flat percentages.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TankeringInputs, TankeringResult, CruiseMode } from '../data/types'
import { listAircraft, getAircraft } from '../data/aircraft_registry'
import { calculateTankering, sensitivitySweep } from '../engine/tankering_calc'
import { isaTemperature } from '../engine/temperature_correction'

// ─── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0c0f16', panel: '#141820', header: '#1a2030',
  border: '#1e2a3a', input: '#0c0f16',
  text: '#dde3f0', sec: '#8a9ab8', muted: '#506880',
  accent: '#f0a500', go: '#22c55e', goDim: '#166534',
  nogo: '#ef4444', nogoDim: '#7f1d1d',
  warn: '#f59e0b', warnDim: '#78350f',
  chartGrid: '#1a2535', chartAxis: '#6a7a90',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtN = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const fmtC = (n: number, d = 2) => `${n < 0 ? '-' : ''}$${fmtN(Math.abs(n), d)}`

// ─── Reusable UI ─────────────────────────────────────────────────────────────
function Field({ label, tip, children, error }: {
  label: string; tip?: string; children: React.ReactNode; error?: string
}) {
  return (
    <div className="mb-3">
      <label className="flex items-center gap-1 text-xs font-semibold tracking-widest uppercase mb-1.5"
        style={{ color: C.sec, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {label}
        {tip && <InfoTip text={tip} />}
      </label>
      {children}
      {error && <div className="text-xs mt-1" style={{ color: C.nogo }}>{error}</div>}
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)
  const [pos, setPos] = React.useState({ top: 0, left: 0 })

  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({
        top: r.bottom + 8,
        left: Math.min(Math.max(r.left - 120, 8), window.innerWidth - 296),
      })
    }
    setShow(true)
  }

  return (
    <span className="relative inline-flex ml-1">
      <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}
        className="cursor-help text-xs" style={{ color: C.accent }}>&#9432;</span>
      {show && (
        <span className="fixed z-[99999] rounded text-xs leading-relaxed pointer-events-none"
          style={{
            top: pos.top, left: pos.left, width: 280, maxWidth: '90vw',
            background: C.header, color: C.sec, border: `1px solid ${C.border}`,
            padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>{text}</span>
      )}
    </span>
  )
}

const inputCls = `w-full rounded px-3 py-2 text-sm font-mono border transition-colors`
const inputStyle = { background: C.input, borderColor: C.border, color: C.text }
const selectStyle = { ...inputStyle, appearance: 'none' as const, paddingRight: 28 }

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function Panel({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="rounded overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-3"
        style={{ background: C.header, borderBottom: `1px solid ${C.border}` }}>
        <h2 className="text-xs font-bold tracking-[3px] uppercase" style={{ color: C.sec }}>{title}</h2>
        {badge}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ─── Chart Tooltip ───────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded px-3 py-2 text-xs" style={{ background: C.header, border: `1px solid ${C.border}` }}>
      <div className="font-semibold mb-1" style={{ color: C.muted }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? fmtC(p.value) : p.value}
        </div>
      ))}
    </div>
  )
}

// ─── Results Components ──────────────────────────────────────────────────────
function VerdictCard({ result }: { result: TankeringResult }) {
  const { worthIt, netSavings } = result
  const bg = worthIt ? C.goDim : C.nogoDim
  const border = worthIt ? C.go : C.nogo
  const icon = worthIt ? '✓' : '✗'
  const verdict = worthIt ? 'TANKER — SAVES MONEY' : 'DO NOT TANKER'

  return (
    <div className="rounded flex items-center justify-between flex-wrap gap-4 px-6 py-4"
      style={{ background: bg, border: `2px solid ${border}` }}>
      <div className="flex items-center gap-4">
        <span className="text-4xl" style={{ color: border }}>{icon}</span>
        <div>
          <div className="text-lg font-bold tracking-[3px] uppercase" style={{ color: border }}>{verdict}</div>
          <div className="text-xs tracking-wider uppercase" style={{ color: border, opacity: 0.7 }}>
            {worthIt ? 'Price differential exceeds burn penalty' : 'Burn penalty exceeds price savings'}
          </div>
        </div>
      </div>
      <div className="font-mono text-3xl font-bold" style={{ color: border }}>
        {netSavings < 0 ? '-' : ''}${fmtN(Math.abs(netSavings), 2)}
      </div>
    </div>
  )
}

function FinancialBreakdown({ result }: { result: TankeringResult }) {
  const rows = [
    { label: 'Gross Savings (tanker × price diff)', val: fmtC(result.grossSavings), highlight: false },
    { label: 'Burn Penalty Cost', val: `-${fmtC(result.penaltyCost)}`, highlight: false },
    { label: 'Net Savings', val: fmtC(result.netSavings), highlight: true },
    { label: 'Break-Even Price Diff', val: `$${fmtN(result.breakEvenPriceDiff, 3)}/gal`, highlight: false },
  ]
  return (
    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="py-2 px-4 text-xs font-semibold tracking-wide uppercase"
              style={{ color: C.sec }}>{r.label}</td>
            <td className="py-2 px-4 text-right font-mono text-sm"
              style={{ color: r.highlight ? (result.worthIt ? C.go : C.nogo) : C.text, fontWeight: r.highlight ? 700 : 400 }}>
              {r.val}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PenaltyBreakdown({ result, fuelDensity }: { result: TankeringResult; fuelDensity: number }) {
  const rows = [
    { label: 'Cruise Penalty', val: `${fmtN(result.cruisePenalty_lb, 1)} lb (${fmtN(result.cruisePenalty_lb / fuelDensity, 1)} gal)` },
    { label: 'Climb Penalty', val: `${fmtN(result.climbPenalty_lb, 1)} lb (${fmtN(result.climbPenalty_lb / fuelDensity, 1)} gal)` },
    { label: 'Total Penalty', val: `${fmtN(result.totalPenalty_lb, 1)} lb (${fmtN(result.totalPenalty_gal, 1)} gal)`, highlight: true },
    { label: 'Penalty as % of Tankered', val: `${fmtN(result.penaltyPct, 1)}%` },
    { label: 'Fuel Flow — Normal Weight', val: `${fmtN(result.ffNormal, 0)} lb/hr` },
    { label: 'Fuel Flow — Tankered Weight', val: `${fmtN(result.ffHeavy, 0)} lb/hr` },
    { label: 'Delta Fuel Flow', val: `${result.ffDelta >= 0 ? '+' : ''}${fmtN(result.ffDelta, 1)} lb/hr`, highlight: true },
  ]
  return (
    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="py-2 px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: C.sec }}>{r.label}</td>
            <td className="py-2 px-4 text-right font-mono text-sm"
              style={{ color: r.highlight ? C.accent : C.text }}>{r.val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TripDetails({ result }: { result: TankeringResult }) {
  const rows = [
    { label: 'Effective Cruise Distance', val: `${fmtN(result.effectiveCruiseNM, 0)} NM` },
    { label: 'Cruise Time (wind-corrected)', val: `${fmtN(result.cruiseTime_hrs * 60, 0)} min` },
    { label: 'Cruise KTAS (at tankered weight)', val: `${fmtN(result.cruiseKtas, 0)} kt` },
    { label: 'Wind Correction Factor', val: `${fmtN(result.windCorrectionFactor, 3)}` },
    { label: 'Climb Distance (heavy)', val: `${fmtN(result.climbDistanceHeavy, 0)} NM` },
    { label: 'Climb Fuel — Normal', val: `${fmtN(result.climbFuelNormal, 0)} lb` },
    { label: 'Climb Fuel — Heavy', val: `${fmtN(result.climbFuelHeavy, 0)} lb` },
  ]
  if (result.isaDeviation !== null) {
    rows.push(
      { label: 'ISA Deviation', val: `${result.isaDeviation >= 0 ? '+' : ''}${fmtN(result.isaDeviation, 1)}°C` },
      { label: 'Temp Correction Factor', val: `${fmtN(result.isaTempCorrection, 4)}` },
    )
  }
  return (
    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="py-2 px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: C.sec }}>{r.label}</td>
            <td className="py-2 px-4 text-right font-mono text-sm" style={{ color: C.text }}>{r.val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RuleOfThumbComparison({ result }: { result: TankeringResult }) {
  if (!result.ruleOfThumb) return null
  const rot = result.ruleOfThumb
  const diff = result.netSavings - rot.netSavings
  return (
    <Panel title="Rule of Thumb Comparison">
      <div className="text-xs mb-3" style={{ color: C.muted }}>
        Comparing actual POH-interpolated result vs the operator's flat "150 gal/hr, 400 kt" estimate.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="text-xs tracking-wider uppercase mb-1" style={{ color: C.muted }}>RULE OF THUMB</div>
          <div className="font-mono text-lg font-bold" style={{ color: C.sec }}>{fmtC(rot.netSavings)}</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>{fmtN(rot.ffUsed)} lb/hr • {fmtN(rot.ktasUsed)} kt</div>
          <div className="text-xs" style={{ color: C.muted }}>Penalty: {fmtC(rot.penaltyCost)}</div>
        </div>
        <div className="rounded p-3 text-center" style={{ background: C.bg, border: `2px solid ${C.accent}` }}>
          <div className="text-xs tracking-wider uppercase mb-1" style={{ color: C.accent }}>POH DATA</div>
          <div className="font-mono text-lg font-bold" style={{ color: C.accent }}>{fmtC(result.netSavings)}</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>{fmtN(result.ffHeavy)} lb/hr • {fmtN(result.cruiseKtas)} kt</div>
          <div className="text-xs" style={{ color: C.muted }}>Penalty: {fmtC(result.penaltyCost)}</div>
        </div>
        <div className="rounded p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="text-xs tracking-wider uppercase mb-1" style={{ color: C.muted }}>DIFFERENCE</div>
          <div className="font-mono text-lg font-bold" style={{ color: diff > 0 ? C.go : diff < 0 ? C.nogo : C.sec }}>
            {diff >= 0 ? '+' : ''}{fmtC(diff)}
          </div>
          <div className="text-xs mt-2" style={{ color: C.muted }}>
            {Math.abs(diff) < 1
              ? 'Models agree'
              : diff > 0
                ? 'Rule of thumb underestimates savings'
                : 'Rule of thumb overestimates savings'}
          </div>
        </div>
      </div>
      <div className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
        The flat rule of thumb uses a single fuel flow number (150 gal/hr) that doesn't vary with weight.
        Because it ignores weight sensitivity, it always shows zero burn penalty.
        {result.ffDelta > 5
          ? ' At LRC, actual fuel flow changes significantly with weight — the POH data captures this.'
          : ' At HSC, weight sensitivity is minimal, so both methods converge.'}
      </div>
    </Panel>
  )
}

// ─── Main Calculator Page ────────────────────────────────────────────────────
export default function Calculator() {
  const aircraft = listAircraft()

  // ─── State ──────────────────────────────────────────────────────────────
  const [aircraftId, setAircraftId] = useState('cj4_525c')
  const [cruiseMode, setCruiseMode] = useState<CruiseMode>('hsc')
  const [cruiseAlt, setCruiseAlt] = useState(39000)
  const [tripDist, setTripDist] = useState<string>('500')
  const [plannedWeight, setPlannedWeight] = useState<string>('15000')
  const [tankerGal, setTankerGal] = useState<string>('100')
  const [windKt, setWindKt] = useState<string>('0')
  const [tempC, setTempC] = useState<string>('')
  const [depElev, setDepElev] = useState<string>('0')
  const [originPrice, setOriginPrice] = useState<string>('5.00')
  const [destPrice, setDestPrice] = useState<string>('7.00')
  const [fuelDensity, setFuelDensity] = useState<string>('6.7')
  const [descentDist, setDescentDist] = useState<string>('50')
  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [paxCount, setPaxCount] = useState<string>('4')
  const [avgPaxWt, setAvgPaxWt] = useState<string>('200')
  const [bagWtPerPax, setBagWtPerPax] = useState<string>('30')
  const [taxiFuel, setTaxiFuel] = useState<string>('120')

  const [result, setResult] = useState<TankeringResult | null>(null)
  const [sensChart, setSensChart] = useState<'priceDiff' | 'wind' | 'tankerAmount'>('priceDiff')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const ac = getAircraft(aircraftId)
  const fd = parseFloat(fuelDensity) || 6.7
  const tankerLb = (parseFloat(tankerGal) || 0) * fd
  const pWeight = parseFloat(plannedWeight) || 0

  // ─── Derived helpers ────────────────────────────────────────────────────
  const maxTankerLb = ac
    ? Math.min(ac.weights.mtow - pWeight, ac.weights.maxFuel_lb)
    : 0
  const maxTankerGal = maxTankerLb / fd
  const overMTOW = ac && (pWeight + tankerLb) > ac.weights.mtow

  // Weight breakdown helper
  const weightHelper = useMemo(() => {
    if (!ac) return null
    const pax = (parseInt(paxCount) || 0) * (parseFloat(avgPaxWt) || 200)
    const bags = (parseInt(paxCount) || 0) * (parseFloat(bagWtPerPax) || 30)
    const tripFuelEstLb = pWeight - ac.weights.bow - pax - bags
    return {
      bow: ac.weights.bow,
      paxWeight: pax,
      bagWeight: bags,
      estimatedTripFuel: Math.max(0, tripFuelEstLb),
      total: ac.weights.bow + pax + bags + Math.max(0, tripFuelEstLb),
    }
  }, [ac, paxCount, avgPaxWt, bagWtPerPax, pWeight])

  // ISA temp at selected altitude
  const isaTemp = isaTemperature(cruiseAlt)

  // ─── Available altitudes ────────────────────────────────────────────────
  const cruiseAltitudes = ac
    ? (cruiseMode === 'hsc' ? ac.hsc : ac.lrc).altitudes.filter(a => a >= 21000)
    : []

  // ─── Run Calculation ───────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    const errs: Record<string, string> = {}
    if (!parseFloat(tripDist)) errs.tripDist = 'Enter trip distance'
    if (!pWeight) errs.weight = 'Enter planned cruise weight'
    if (!parseFloat(originPrice)) errs.originPrice = 'Enter origin fuel price'
    if (!parseFloat(destPrice)) errs.destPrice = 'Enter destination fuel price'
    setErrors(errs)
    if (Object.keys(errs).length) { setResult(null); return }

    const inputs: TankeringInputs = {
      aircraftId,
      cruiseMode,
      cruiseAltitude: cruiseAlt,
      tripDistance: parseFloat(tripDist),
      plannedCruiseWeight: pWeight,
      tankerAmount_lb: tankerLb,
      windComponent: parseFloat(windKt) || 0,
      forecastTemp_c: tempC ? parseFloat(tempC) : null,
      departureElevation: parseFloat(depElev) || 0,
      originPrice: parseFloat(originPrice),
      destPrice: parseFloat(destPrice),
      fuelDensity: fd,
      descentDistance: parseFloat(descentDist) || 50,
    }

    const r = calculateTankering(inputs)
    setResult(r)
  }, [aircraftId, cruiseMode, cruiseAlt, tripDist, pWeight, tankerLb, windKt, tempC, depElev, originPrice, destPrice, fd, descentDist])

  // ─── Sensitivity data ──────────────────────────────────────────────────
  const sensData = useMemo(() => {
    if (!result) return []
    const inputs: TankeringInputs = {
      aircraftId, cruiseMode, cruiseAltitude: cruiseAlt,
      tripDistance: parseFloat(tripDist) || 500,
      plannedCruiseWeight: pWeight,
      tankerAmount_lb: tankerLb,
      windComponent: parseFloat(windKt) || 0,
      forecastTemp_c: tempC ? parseFloat(tempC) : null,
      departureElevation: parseFloat(depElev) || 0,
      originPrice: parseFloat(originPrice) || 5,
      destPrice: parseFloat(destPrice) || 7,
      fuelDensity: fd,
      descentDistance: parseFloat(descentDist) || 50,
    }
    return sensitivitySweep(inputs, sensChart, 30)
  }, [result, sensChart, aircraftId, cruiseMode, cruiseAlt, tripDist, pWeight, tankerLb, windKt, tempC, depElev, originPrice, destPrice, fd, descentDist])

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      {/* ═══ HEADER ═══ */}
      <header className="px-6 py-3 flex items-center justify-between flex-wrap gap-3"
        style={{ background: `linear-gradient(180deg,${C.header},${C.bg})`, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h1 className="text-xl font-bold tracking-[4px] uppercase" style={{ color: C.accent }}>
            FUEL TANKERING TOOL
          </h1>
          <p className="text-[10px] tracking-[2.5px] uppercase mt-0.5" style={{ color: C.muted }}>
            POH-Data Performance Analysis
          </p>
        </div>
        {ac && (
          <div className="text-right">
            <div className="text-xs tracking-wider" style={{ color: C.sec }}>{ac.displayName}</div>
            <div className="text-[10px]" style={{ color: C.muted }}>{ac.dataSource}</div>
          </div>
        )}
      </header>

      {/* ═══ MAIN GRID ═══ */}
      <div className="max-w-5xl mx-auto px-4 py-5 grid gap-4">

        {/* ═══ AIRCRAFT & CRUISE ═══ */}
        <Panel title="Aircraft & Cruise Configuration">
          <Row2>
            <Field label="Aircraft" tip="Select aircraft type. Performance data is interpolated from the aircraft's Flight Planning Guide.">
              <select className={inputCls} style={selectStyle} value={aircraftId}
                onChange={e => setAircraftId(e.target.value)}>
                {aircraft.map(a => (
                  <option key={a.id} value={a.id}>{a.displayName}</option>
                ))}
              </select>
            </Field>
            <Field label="Cruise Mode" tip="HSC (High Speed Cruise): max cruise thrust, highest speed, lowest weight sensitivity. LRC (Long Range Cruise): optimized for range, much higher weight sensitivity — this is where tankering penalty matters most.">
              <div className="grid grid-cols-2 gap-2">
                {(['hsc', 'lrc'] as CruiseMode[]).map(m => (
                  <button key={m} onClick={() => setCruiseMode(m)}
                    className="rounded py-2 text-xs font-bold tracking-[2px] uppercase transition-all"
                    style={{
                      background: cruiseMode === m ? '#1e2d45' : 'transparent',
                      border: `1px solid ${cruiseMode === m ? C.accent : C.border}`,
                      color: cruiseMode === m ? C.accent : C.muted,
                    }}>
                    {m === 'hsc' ? 'HIGH SPEED' : 'LONG RANGE'}
                  </button>
                ))}
              </div>
            </Field>
          </Row2>
          <Row2>
            <Field label="Cruise Altitude" tip="Select from altitudes available in the POH tables. Higher altitudes generally have lower fuel flow but higher weight sensitivity at LRC.">
              <select className={inputCls} style={selectStyle} value={cruiseAlt}
                onChange={e => setCruiseAlt(parseInt(e.target.value))}>
                {cruiseAltitudes.map(a => (
                  <option key={a} value={a}>FL{(a / 100).toFixed(0)} ({a.toLocaleString()} ft)</option>
                ))}
              </select>
            </Field>
            <Field label="Trip Distance (NM)" error={errors.tripDist}>
              <input className={inputCls} style={inputStyle} type="number" value={tripDist}
                onChange={e => setTripDist(e.target.value)} placeholder="e.g. 500" />
            </Field>
          </Row2>
        </Panel>

        {/* ═══ WEIGHT ═══ */}
        <Panel title="Weight"
          badge={overMTOW ? (
            <span className="text-xs font-bold tracking-wider px-3 py-1 rounded"
              style={{ background: C.nogoDim, color: C.nogo, border: `1px solid ${C.nogo}` }}>
              ⚠ EXCEEDS MTOW
            </span>
          ) : undefined}>
          <Row2>
            <Field label="Planned Cruise Weight (lb)" tip="Aircraft total weight at start of cruise (BOW + pax + bags + trip fuel). Use the breakdown helper below." error={errors.weight}>
              <input className={inputCls} style={inputStyle} type="number" value={plannedWeight}
                onChange={e => setPlannedWeight(e.target.value)} />
            </Field>
            <Field label="Fuel to Tanker (gal)" tip={`Extra fuel to carry. Max: ${fmtN(maxTankerGal, 0)} gal (${fmtN(maxTankerLb, 0)} lb) based on MTOW and tank limits.`}>
              <div className="flex gap-2 items-end">
                <input className={`${inputCls} flex-1`} style={inputStyle} type="number" value={tankerGal}
                  onChange={e => setTankerGal(e.target.value)} />
                <span className="text-xs font-mono pb-2" style={{ color: C.muted }}>
                  = {fmtN(tankerLb, 0)} lb
                </span>
              </div>
            </Field>
          </Row2>

          {/* Weight breakdown helper */}
          {weightHelper && ac && (
            <div className="rounded p-3 mt-2 text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-2"
              style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <div><span style={{ color: C.muted }}>BOW:</span> <span style={{ color: C.sec }}>{fmtN(weightHelper.bow)} lb</span></div>
              <div><span style={{ color: C.muted }}>Pax:</span> <span style={{ color: C.sec }}>{fmtN(weightHelper.paxWeight)} lb</span></div>
              <div><span style={{ color: C.muted }}>Bags:</span> <span style={{ color: C.sec }}>{fmtN(weightHelper.bagWeight)} lb</span></div>
              <div><span style={{ color: C.muted }}>Trip Fuel (est):</span> <span style={{ color: C.accent }}>{fmtN(weightHelper.estimatedTripFuel)} lb</span></div>
              <div className="col-span-2 sm:col-span-4 pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.muted }}>MTOW: {fmtN(ac.weights.mtow)} lb</span>
                <span className="mx-3" style={{ color: C.border }}>|</span>
                <span style={{ color: C.muted }}>Max Fuel: {fmtN(ac.weights.maxFuel_lb)} lb ({fmtN(ac.weights.maxFuel_gal, 0)} gal)</span>
                <span className="mx-3" style={{ color: C.border }}>|</span>
                <span style={{ color: C.muted }}>Max Tanker: {fmtN(maxTankerGal, 0)} gal</span>
              </div>
            </div>
          )}
        </Panel>

        {/* ═══ FUEL PRICES ═══ */}
        <Panel title="Fuel Prices">
          <Row2>
            <Field label="Origin Price ($/gal)" error={errors.originPrice}>
              <input className={inputCls} style={inputStyle} type="number" step="0.01" value={originPrice}
                onChange={e => setOriginPrice(e.target.value)} placeholder="e.g. 5.00" />
            </Field>
            <Field label="Destination Price ($/gal)" error={errors.destPrice}>
              <input className={inputCls} style={inputStyle} type="number" step="0.01" value={destPrice}
                onChange={e => setDestPrice(e.target.value)} placeholder="e.g. 7.00" />
            </Field>
          </Row2>
          {originPrice && destPrice && (
            <div className="font-mono text-sm mt-1" style={{
              color: (parseFloat(destPrice) - parseFloat(originPrice)) > 0 ? C.go : C.nogo
            }}>
              Price differential: ${((parseFloat(destPrice) || 0) - (parseFloat(originPrice) || 0)).toFixed(2)}/gal
            </div>
          )}
        </Panel>

        {/* ═══ WEATHER ═══ */}
        <Panel title="Weather">
          <Row2>
            <Field label="Wind Component (kt)" tip="Positive = headwind (increases trip time & penalty). Negative = tailwind.">
              <div className="flex gap-2 items-center">
                <input className={`${inputCls} flex-1`} style={inputStyle} type="number" value={windKt}
                  onChange={e => setWindKt(e.target.value)} placeholder="0" />
                <span className="text-xs whitespace-nowrap" style={{ color: C.muted }}>
                  {(parseFloat(windKt) || 0) > 0 ? 'Headwind' : (parseFloat(windKt) || 0) < 0 ? 'Tailwind' : 'Calm'}
                </span>
              </div>
            </Field>
            <Field label="Temperature at Cruise Alt (°C)" tip={`ISA standard at FL${(cruiseAlt / 100).toFixed(0)}: ${isaTemp.toFixed(1)}°C. Leave blank for ISA conditions.`}>
              <div className="flex gap-2 items-center">
                <input className={`${inputCls} flex-1`} style={inputStyle} type="number" value={tempC}
                  onChange={e => setTempC(e.target.value)} placeholder={`ISA: ${isaTemp.toFixed(1)}°C`} />
                {tempC && (
                  <span className="text-xs font-mono whitespace-nowrap" style={{ color: C.warn }}>
                    ISA{(parseFloat(tempC) - isaTemp) >= 0 ? '+' : ''}{(parseFloat(tempC) - isaTemp).toFixed(0)}
                  </span>
                )}
              </div>
            </Field>
          </Row2>
        </Panel>

        {/* ═══ ADVANCED (collapsible) ═══ */}
        <div className="rounded overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center gap-2 px-5 py-3 cursor-pointer"
            style={{ background: C.header, border: 'none', borderBottom: showAdvanced ? `1px solid ${C.border}` : 'none' }}>
            <span className="text-[10px] transition-transform" style={{ color: C.accent, transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span className="text-xs font-bold tracking-[3px] uppercase" style={{ color: C.sec }}>ADVANCED SETTINGS</span>
          </button>
          {showAdvanced && (
            <div className="px-5 py-4">
              <Row2>
                <Field label="Passengers" tip="Used for weight breakdown estimate.">
                  <input className={inputCls} style={inputStyle} type="number" value={paxCount}
                    onChange={e => setPaxCount(e.target.value)} />
                </Field>
                <Field label="Avg Passenger Weight (lb)" tip="FAA standard: 200 lb (summer).">
                  <input className={inputCls} style={inputStyle} type="number" value={avgPaxWt}
                    onChange={e => setAvgPaxWt(e.target.value)} />
                </Field>
              </Row2>
              <Row2>
                <Field label="Bag Weight per Pax (lb)">
                  <input className={inputCls} style={inputStyle} type="number" value={bagWtPerPax}
                    onChange={e => setBagWtPerPax(e.target.value)} />
                </Field>
                <Field label="Taxi Fuel Allowance (lb)" tip="Default 120 lb per CJ4 mission planning.">
                  <input className={inputCls} style={inputStyle} type="number" value={taxiFuel}
                    onChange={e => setTaxiFuel(e.target.value)} />
                </Field>
              </Row2>
              <Row2>
                <Field label="Fuel Density (lb/gal)" tip="Standard Jet-A: 6.7 lb/gal. Adjust 6.5–6.85 for temperature.">
                  <input className={inputCls} style={inputStyle} type="number" step="0.01" value={fuelDensity}
                    onChange={e => setFuelDensity(e.target.value)} />
                </Field>
                <Field label="Descent Distance (NM)" tip="Fixed estimate for descent. Default 50 NM.">
                  <input className={inputCls} style={inputStyle} type="number" value={descentDist}
                    onChange={e => setDescentDist(e.target.value)} />
                </Field>
              </Row2>
              <Field label="Departure Elevation (ft MSL)" tip="Climb table is based from sea level. High-elevation departures may understate climb slightly.">
                <input className={inputCls} style={inputStyle} type="number" value={depElev}
                  onChange={e => setDepElev(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {/* ═══ RUN BUTTON ═══ */}
        <button onClick={handleRun}
          className="w-full rounded py-4 text-lg font-bold tracking-[4px] uppercase cursor-pointer transition-all"
          style={{
            background: `linear-gradient(180deg, #182a1c, #0e1a11)`,
            border: `2px solid ${C.go}`, color: C.go,
          }}
          onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = `0 0 24px rgba(34,197,94,0.35)` }}
          onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = 'none' }}>
          ▶  RUN ANALYSIS
        </button>

        {/* ═══ WARNINGS ═══ */}
        {result && result.warnings.length > 0 && (
          <div className="rounded p-4" style={{ background: C.warnDim, border: `1px solid ${C.warn}` }}>
            <div className="text-xs font-bold tracking-[2px] uppercase mb-2" style={{ color: C.warn }}>WARNINGS</div>
            {result.warnings.map((w, i) => (
              <div key={i} className="text-xs font-mono mb-1" style={{ color: C.warn }}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {result && (
          <>
            <VerdictCard result={result} />

            <Panel title="Financial Breakdown">
              <FinancialBreakdown result={result} />
            </Panel>

            <Panel title="Burn Penalty Breakdown">
              <PenaltyBreakdown result={result} fuelDensity={fd} />
            </Panel>

            <Panel title="Trip Details">
              <TripDetails result={result} />
            </Panel>

            <RuleOfThumbComparison result={result} />

            {/* ═══ SENSITIVITY CHARTS ═══ */}
            <Panel title="Sensitivity Analysis">
              <div className="flex gap-2 mb-4">
                {([
                  { key: 'priceDiff', label: 'Price Diff' },
                  { key: 'wind', label: 'Wind' },
                  { key: 'tankerAmount', label: 'Tanker Amt' },
                ] as { key: typeof sensChart; label: string }[]).map(s => (
                  <button key={s.key} onClick={() => setSensChart(s.key)}
                    className="rounded px-3 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all"
                    style={{
                      background: sensChart === s.key ? '#1e2d45' : 'transparent',
                      border: `1px solid ${sensChart === s.key ? C.accent : C.border}`,
                      color: sensChart === s.key ? C.accent : C.muted,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sensData} margin={{ top: 4, right: 24, left: 12, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid} />
                  <XAxis dataKey="x"
                    tick={{ fill: C.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }}
                    tickFormatter={v => {
                      if (sensChart === 'priceDiff') return `$${v.toFixed(1)}`
                      if (sensChart === 'wind') return `${v}kt`
                      return `${v.toFixed(0)}g`
                    }}
                    axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis tick={{ fill: C.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }}
                    tickFormatter={v => `$${v.toFixed(0)}`} axisLine={false} tickLine={false} />
                  <RCTooltip content={<ChartTip />} />
                  <ReferenceLine y={0} stroke={C.border} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="netSavings" name="Net Savings"
                    stroke={C.accent} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </>
        )}

        {/* ═══ DATA SOURCE FOOTER ═══ */}
        <div className="flex justify-between items-center py-3 mt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          <span className="text-[10px] font-mono" style={{ color: C.muted }}>
            {ac ? `Calculated using data from ${ac.dataSource} (${ac.dataRevision})` : 'No aircraft selected'}
          </span>
          <span className="text-[10px] font-mono" style={{ color: C.muted }}>
            FOR PLANNING PURPOSES ONLY
          </span>
        </div>
      </div>
    </div>
  )
}
