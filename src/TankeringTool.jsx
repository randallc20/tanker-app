// TankeringTool.jsx — Aviation Fuel Tankering Decision Tool
// Single self-contained React component. Requires recharts.

import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LBS_TO_KG   = 0.453592;
const KG_TO_LBS   = 2.20462;
const LBS_TO_GAL  = 1 / 6.68;   // Jet-A ~6.68 lb/gal
const LBS_TO_LIT  = 1 / 1.776;  // Jet-A ~1.776 lb/liter
const GAL_TO_LBS  = 6.68;
const LIT_TO_LBS  = 1.776;

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AED: '﷼', SGD: 'S$' };

// ─── DEFAULTS (B737-800 / EGLL→KJFK example) ─────────────────────────────────
const DEFAULTS = {
  departure:       'EGLL',
  destination:     'KJFK',
  aircraftType:    'narrow',
  distance:        3450,
  flightHours:     7,
  flightMinutes:   30,
  windComponent:   20,
  // Weight & Performance  (quantities in US gallons — Jet-A ≈ 6.68 lb/gal)
  weightUnit:      'gal',
  fuelUnit:        'gal',
  mtow:            26077,   // 174,200 lb ÷ 6.68
  zfw:             14970,   // 100,000 lb ÷ 6.68
  tripFuel:        8233,    //  55,000 lb ÷ 6.68
  minLandingFuel:  898,     //   6,000 lb ÷ 6.68
  burnPenaltyRate: 3.5,
  // Pricing (per US gallon)
  currency:        'USD',
  priceDep:        6.15,    // ≈ $0.92/lb × 6.68
  priceDest:       7.88,    // ≈ $1.18/lb × 6.68
  upliftDep:       0.27,    // ≈ $0.04/lb × 6.68
  upliftDest:      0.40,    // ≈ $0.06/lb × 6.68
  minPurchaseReq:  0,
  rampFee:         0,
  // Regulatory
  operationType:   'part121',
  altRequired:     true,
  altFuel:         674,     //   4,500 lb ÷ 6.68
  contingencyPct:  5,
  intlFlight:      true,
  taxDiffPct:      0,
};

// ─── UNIT CONVERSION ──────────────────────────────────────────────────────────
function toLbs(val, unit) {
  if (unit === 'kg')     return val * KG_TO_LBS;
  if (unit === 'gal')    return val * GAL_TO_LBS;
  if (unit === 'liters') return val * LIT_TO_LBS;
  return val; // lbs
}
function fromLbs(val, unit) {
  if (unit === 'kg')     return val * LBS_TO_KG;
  if (unit === 'gal')    return val * LBS_TO_GAL;
  if (unit === 'liters') return val * LBS_TO_LIT;
  return val;
}

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────
function runCalc(inp) {
  const unit = inp.fuelUnit;
  // Normalise everything to lbs internally
  const mtow       = toLbs(inp.mtow,           unit);
  const zfw        = toLbs(inp.zfw,            unit);
  const tripFuel   = toLbs(inp.tripFuel,       unit);
  const minLand    = toLbs(inp.minLandingFuel, unit);
  const altFuel    = inp.altRequired ? toLbs(inp.altFuel, unit) : 0;
  const minPurch   = toLbs(inp.minPurchaseReq, unit);
  const burnRate   = inp.burnPenaltyRate / 100;
  const contPct    = inp.contingencyPct / 100;

  // Effective trip fuel with contingency
  const tripEff = tripFuel * (1 + contPct);

  // Destination price including tax differential
  const taxMult  = 1 + inp.taxDiffPct / 100;
  const pDep     = inp.priceDep  + inp.upliftDep;          // total cost/unit at dep
  const pDest    = (inp.priceDest + inp.upliftDest) * taxMult; // total cost/unit at dest

  // Step 1 — Max tankerable (weight-limited)
  // ZFW + tripEff + X*(1+burnRate) + minLand ≤ MTOW
  // X ≤ (MTOW - ZFW - tripEff - minLand) / (1+burnRate)
  const headroom      = mtow - zfw - tripEff - minLand - altFuel;
  const maxTankLbs    = Math.max(0, headroom / (1 + burnRate));

  // Step 6 — Savings per unit (linear model)
  // Net_Savings(X) = X*(pDest) - X*burnRate*pDep
  const savingsPerUnit = pDest - burnRate * pDep;

  // Optimal X: since linear, either 0 or maxTank
  const optLbs = savingsPerUnit > 0 ? maxTankLbs : 0;

  const burnPenLbs   = optLbs * burnRate;
  const grossSav     = optLbs * pDest;
  const costCarry    = burnPenLbs * pDep;

  // Fee adjustment
  let feeAdj = 0;
  if (optLbs > 0 && minPurch > 0) {
    const stillNeeded = Math.max(0, minPurch - optLbs);
    if (stillNeeded <= 0) {
      feeAdj = inp.rampFee; // flat ramp fee avoided
    } else {
      feeAdj = -(stillNeeded * pDest); // still need to buy min
    }
  } else if (optLbs === 0 && inp.rampFee === 0 && minPurch === 0) {
    feeAdj = 0;
  }

  const netSav = grossSav - costCarry + feeAdj;

  // Break-even delta
  const breakEvenDelta = burnRate * pDep;
  const actualDelta    = pDest - pDep;

  // Sensitivity curve (convert display back to chosen unit)
  const STEPS = 30;
  const sensitivityData = [];
  for (let i = 0; i <= STEPS; i++) {
    const xLbs = (maxTankLbs / STEPS) * i;
    const gs   = xLbs * pDest;
    const cc   = xLbs * burnRate * pDep;
    const ns   = gs - cc;
    sensitivityData.push({
      tanker:       Math.round(fromLbs(xLbs, unit)),
      grossSavings: Math.round(gs),
      costToCarry:  Math.round(cc),
      netSavings:   Math.round(ns),
    });
  }

  return {
    maxTanker:    fromLbs(maxTankLbs, unit),
    optTanker:    fromLbs(optLbs, unit),
    burnPenalty:  fromLbs(burnPenLbs, unit),
    grossSav, costCarry, feeAdj, netSav,
    breakEvenDelta, actualDelta,
    sensitivityData, savingsPerUnit,
  };
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function validate(inp) {
  const errs = {};
  if (!inp.departure  || inp.departure.length  < 3) errs.departure  = 'Enter valid ICAO (3–4 chars)';
  if (!inp.destination|| inp.destination.length < 3) errs.destination = 'Enter valid ICAO (3–4 chars)';
  if (inp.mtow   <= 0) errs.mtow   = 'MTOW must be > 0';
  if (inp.zfw    <= 0) errs.zfw    = 'ZFW must be > 0';
  if (inp.zfw >= inp.mtow)         errs.zfw     = 'ZFW must be less than MTOW';
  if (inp.tripFuel <= 0)           errs.tripFuel= 'Trip fuel must be > 0';
  if (inp.priceDep  < 0)           errs.priceDep = 'Price cannot be negative';
  if (inp.priceDest < 0)           errs.priceDest= 'Price cannot be negative';
  const unit = inp.fuelUnit;
  const totalLbs = toLbs(inp.zfw + inp.tripFuel + inp.minLandingFuel, unit);
  if (totalLbs > toLbs(inp.mtow, unit)) {
    errs.tripFuel = 'ZFW + Trip Fuel + Min Landing Fuel exceeds MTOW';
  }
  return errs;
}

// ─── TOOLTIP COMPONENT ────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 5 }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ cursor: 'help', color: '#f0a500', fontSize: 13, lineHeight: 1 }}
      >ⓘ</span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%',
          transform: 'translateX(-50%)', background: '#1c2235',
          color: '#b8c4d8', padding: '8px 12px', borderRadius: 3,
          fontSize: 12, width: 240, zIndex: 9999,
          border: '1px solid #2a3550', lineHeight: 1.6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)', pointerEvents: 'none',
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 400,
          letterSpacing: 0,
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── FIELD WRAPPER ────────────────────────────────────────────────────────────
function Field({ label, tip, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center',
        fontSize: 12, fontWeight: 600, letterSpacing: '1.2px',
        textTransform: 'uppercase', color: '#8a9ab8', marginBottom: 6,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        {label}{tip && <InfoTip text={tip} />}
      </label>
      {children}
      {error && <div style={{ color: '#e05050', fontSize: 11, marginTop: 3, letterSpacing: '0.5px' }}>{error}</div>}
    </div>
  );
}

// ─── PANEL WRAPPER ────────────────────────────────────────────────────────────
function Panel({ num, title, children }) {
  return (
    <div style={{
      background: '#141820', border: '1px solid #1e2a3a',
      borderRadius: 3, overflow: 'hidden',
    }}>
      <div style={{
        background: '#1a2030', padding: '9px 16px',
        borderBottom: '1px solid #1e2a3a',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#506080' }}>{num}</span>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: '#aabdd0',
        }}>{title}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

// ─── INPUT PRIMITIVES ─────────────────────────────────────────────────────────
const inputStyle = (error) => ({
  width: '100%', background: '#0c0f16',
  border: `1px solid ${error ? '#c04040' : '#1e2a3a'}`,
  borderRadius: 2, color: '#dde3f0', padding: '7px 10px',
  fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
  outline: 'none', transition: 'border-color 0.15s',
});

const selectStyle = {
  width: '100%', background: '#0c0f16',
  border: '1px solid #1e2a3a', borderRadius: 2,
  color: '#dde3f0', padding: '7px 30px 7px 10px',
  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14,
  outline: 'none', cursor: 'pointer', appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a6a85'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

function Suffix({ children }) {
  return (
    <span style={{
      background: '#1a2030', border: '1px solid #1e2a3a', borderLeft: 'none',
      borderRadius: '0 2px 2px 0', padding: '7px 10px',
      fontSize: 12, color: '#7a8fa8', whiteSpace: 'nowrap',
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.5px',
    }}>{children}</span>
  );
}

function InputWithSuffix({ suffix, error, ...props }) {
  return (
    <div style={{ display: 'flex' }}>
      <input style={{ ...inputStyle(error), borderRight: 'none', borderRadius: '2px 0 0 2px', flex: 1 }} {...props} />
      <Suffix>{suffix}</Suffix>
    </div>
  );
}

function Toggle({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid #1e2a3a', borderRadius: 2, overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, border: 'none', cursor: 'pointer', padding: '7px 8px',
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
          letterSpacing: '0.5px', textTransform: 'uppercase',
          background: value === o.value ? '#1e2d45' : 'transparent',
          color: value === o.value ? '#4db8ff' : '#7a8fa8',
          transition: 'all 0.15s',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ─── CUSTOM RECHARTS TOOLTIP ──────────────────────────────────────────────────
function ChartTip({ active, payload, label, sym }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1a2030', border: '1px solid #2a3550',
      borderRadius: 3, padding: '8px 12px',
      fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
    }}>
      <div style={{ color: '#8090b0', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {sym}{p.value?.toLocaleString()}
        </div>
      ))}
    </div>
  );
}

// ─── RESULTS PANEL ────────────────────────────────────────────────────────────
function ResultsPanel({ res, inp, sym }) {
  const { maxTanker, optTanker, burnPenalty, grossSav, costCarry,
          feeAdj, netSav, breakEvenDelta, actualDelta, sensitivityData } = res;
  const unit = inp.fuelUnit;

  const fmtN = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtU = (n) => `${fmtN(n, 1)} ${unit}`;
  const fmtC = (n, d = 2) => `${n < 0 ? '-' : ''}${sym}${fmtN(Math.abs(n), d)}`;

  let status = 'go';
  if (netSav <= 0) status = 'no-go';
  else if (netSav < 200 || (grossSav > 0 && netSav / grossSav < 0.05)) status = 'marginal';

  const badgeCfg = {
    go:       { bg: '#0a1e10', border: '#28a048', color: '#38d068', icon: '✓', label: 'TANKER FUEL',       sub: 'ECONOMICALLY ADVANTAGEOUS' },
    'no-go':  { bg: '#1e0a0a', border: '#a02828', color: '#e04040', icon: '✗', label: 'DO NOT TANKER',    sub: 'NOT ECONOMICALLY JUSTIFIED' },
    marginal: { bg: '#1e160a', border: '#b07020', color: '#f0a500', icon: '⚠', label: 'MARGINAL — REVIEW', sub: 'NEAR BREAK-EVEN THRESHOLD' },
  };
  const bc = badgeCfg[status];

  const dataRows = [
    { label: 'Max Tankerable Fuel',       val: fmtU(maxTanker),         highlight: false },
    { label: 'Recommended Tanker Amount', val: fmtU(optTanker),         highlight: true  },
    { label: 'Fuel Burn Penalty',         val: fmtU(burnPenalty),       highlight: false },
    { label: 'Gross Savings',             val: fmtC(grossSav),          color: '#38d068' },
    { label: 'Cost of Tankering',         val: `−${sym}${fmtN(costCarry,2)}`, color: '#e04040' },
    { label: 'Fee Adjustment',            val: fmtC(feeAdj),            color: feeAdj >= 0 ? '#38d068' : '#e04040' },
    { label: 'Break-Even Price Delta',    val: `${sym}${fmtN(breakEvenDelta,4)}/${unit}`, highlight: false },
    { label: 'Actual Price Differential', val: `${sym}${fmtN(actualDelta,4)}/${unit}`,
      color: actualDelta > breakEvenDelta ? '#38d068' : '#e04040' },
  ];

  const barData = [
    { name: 'GROSS SAVINGS', value: Math.round(grossSav),  fill: '#28a048' },
    { name: 'CARRY COST',    value: Math.round(costCarry), fill: '#a02828' },
    { name: 'NET SAVINGS',   value: Math.round(netSav),    fill: netSav >= 0 ? '#f0a500' : '#c03030' },
  ];

  const summary = status === 'no-go'
    ? `ASSESSMENT: At current prices, tankering from ${inp.departure} to ${inp.destination} is NOT economically justified. The price differential of ${sym}${fmtN(actualDelta,4)}/${unit} is below the break-even threshold of ${sym}${fmtN(breakEvenDelta,4)}/${unit}. Recommend standard fuel load only.`
    : `ASSESSMENT: Tankering ${fmtN(optTanker,0)} ${unit} from ${inp.departure} to ${inp.destination} yields a net saving of ${fmtC(netSav)} after accounting for the ${fmtN(burnPenalty,0)} ${unit} burn penalty (${fmtC(costCarry)} cost to carry). Price differential of ${sym}${fmtN(actualDelta,4)}/${unit} exceeds the break-even threshold of ${sym}${fmtN(breakEvenDelta,4)}/${unit}.`;

  return (
    <div style={{
      gridColumn: '1 / -1',
      background: '#141820', border: '1px solid #1e2a3a', borderRadius: 3, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: '#1a2030', padding: '12px 20px',
        borderBottom: '1px solid #1e2a3a',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: '3px',
          textTransform: 'uppercase', color: '#8a9ab8',
        }}>DECISION READOUT</div>

        <div style={{
          background: bc.bg, border: `2px solid ${bc.border}`,
          borderRadius: 3, padding: '6px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22, color: bc.color }}>{bc.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '2px', color: bc.color }}>{bc.label}</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '1.5px', color: bc.border }}>{bc.sub}</div>
          </div>
        </div>
      </div>

      {/* Data + Bar Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

        {/* Data Table */}
        <div style={{ borderRight: '1px solid #1e2a3a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {dataRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #131a28' }}>
                  <td style={{
                    padding: '9px 16px', fontSize: 12, fontWeight: 600,
                    letterSpacing: '0.8px', textTransform: 'uppercase', color: '#8090b8',
                    fontFamily: "'Barlow Condensed', sans-serif", width: '56%',
                  }}>{row.label}</td>
                  <td style={{
                    padding: '9px 16px', textAlign: 'right',
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: row.highlight ? 14 : 13,
                    color: row.color || (row.highlight ? '#f0a500' : '#ccd4e8'),
                  }}>{row.val}</td>
                </tr>
              ))}
              {/* NET SAVINGS — prominent row */}
              <tr style={{ background: '#1a2030' }}>
                <td style={{
                  padding: '13px 16px', fontSize: 13, fontWeight: 700,
                  letterSpacing: '2px', textTransform: 'uppercase', color: '#b0c0d8',
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}>NET SAVINGS</td>
                <td style={{
                  padding: '13px 16px', textAlign: 'right',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 22, fontWeight: 700,
                  color: netSav >= 0 ? '#38d068' : '#e04040',
                }}>{fmtC(netSav)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bar Chart */}
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
            color: '#3a4a65', marginBottom: 10,
          }}>SAVINGS BREAKDOWN</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#6a7a90', fontSize: 10, fontFamily: 'Share Tech Mono' }} axisLine={{ stroke: '#1e2a3a' }} tickLine={false} />
              <YAxis tick={{ fill: '#6a7a90', fontSize: 10, fontFamily: 'Share Tech Mono' }}
                tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`}
                axisLine={false} tickLine={false} />
              <RCTooltip content={<ChartTip sym={sym} />} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sensitivity Line Chart */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #131a28' }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase',
          color: '#6a7a95', marginBottom: 10,
        }}>SENSITIVITY ANALYSIS — NET SAVINGS vs TANKERED FUEL AMOUNT ({unit.toUpperCase()})</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={sensitivityData} margin={{ top: 4, right: 24, left: 12, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" />
            <XAxis dataKey="tanker"
              tick={{ fill: '#6a7a90', fontSize: 10, fontFamily: 'Share Tech Mono' }}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              axisLine={{ stroke: '#1e2a3a' }} tickLine={false}
              label={{ value: `Tankered Fuel (${unit})`, position: 'insideBottom', offset: -14, fill: '#3a4a65', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
            <YAxis tick={{ fill: '#6a7a90', fontSize: 10, fontFamily: 'Share Tech Mono' }}
              tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`}
              axisLine={false} tickLine={false} />
            <RCTooltip content={<ChartTip sym={sym} />} />
            <Legend
              wrapperStyle={{ paddingTop: 8, fontFamily: 'Share Tech Mono', fontSize: 10, color: '#5a6a80' }}
              formatter={n => n} />
            <ReferenceLine y={0} stroke="#2a3a50" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="grossSavings" name="Gross Savings" stroke="#28a048" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="costToCarry"  name="Cost to Carry" stroke="#a02828" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="netSavings"   name="Net Savings"   stroke="#f0a500" strokeWidth={2}   dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #131a28', background: '#0f1219' }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
          color: '#506070', marginBottom: 8,
        }}>SYSTEM ASSESSMENT</div>
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13, color: '#9aaabb', lineHeight: 1.9,
          borderLeft: `3px solid ${bc.border}`, paddingLeft: 14,
        }}>{summary}</div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TankeringTool() {
  const [inp, setInp] = useState({ ...DEFAULTS });
  const [results, setResults] = useState(null);
  const [errors,  setErrors]  = useState({});
  const [unitSys, setUnitSys] = useState('imperial');

  const set = useCallback((k, v) => setInp(p => ({ ...p, [k]: v })), []);

  const handleUnitSys = useCallback((sys) => {
    if (sys === unitSys) return;
    const targetUnit = sys === 'metric' ? 'liters' : 'gal';
    setInp(p => {
      const newUnit = targetUnit;
      const convert = (v) => Math.round(fromLbs(toLbs(v, p.fuelUnit), newUnit));
      return {
        ...p,
        mtow:          convert(p.mtow),
        zfw:           convert(p.zfw),
        tripFuel:      convert(p.tripFuel),
        minLandingFuel:convert(p.minLandingFuel),
        altFuel:       convert(p.altFuel),
        minPurchaseReq:convert(p.minPurchaseReq),
        weightUnit:    newUnit,
        fuelUnit:      newUnit,
      };
    });
    setUnitSys(sys);
  }, [unitSys]);

  const handleRun = useCallback(() => {
    const errs = validate(inp);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setResults(runCalc(inp));
  }, [inp]);

  const handleReset = useCallback(() => {
    setInp({ ...DEFAULTS });
    setResults(null);
    setErrors({});
    setUnitSys('imperial');
  }, []);

  const sym  = CURRENCY_SYMBOLS[inp.currency] || '$';
  const unit = inp.fuelUnit;

  const Row2 = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0f16; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input:focus, select:focus { border-color: #f0a500 !important; }
        input[type=range] { accent-color: #f0a500; }
        .avn-select-wrap { position: relative; }
        .avn-select-wrap::after {
          content: '';
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          border: 4px solid transparent; border-top-color: #5a6a85;
          pointer-events: none;
        }
        @media (max-width: 860px) {
          .avn-grid { grid-template-columns: 1fr !important; }
          .avn-data-split { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh', background: '#0c0f16',
        color: '#c0cad8', fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        {/* ── HEADER ── */}
        <div style={{
          background: 'linear-gradient(180deg,#141c28 0%,#0c0f16 100%)',
          borderBottom: '1px solid #1e2a3a',
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 22, fontWeight: 700, letterSpacing: '4px',
              textTransform: 'uppercase', color: '#f0a500',
            }}>TANKER FUEL DECISION TOOL</div>
            <div style={{
              fontSize: 11, letterSpacing: '2.5px', color: '#506880',
              textTransform: 'uppercase', marginTop: 2,
            }}>Aviation Fuel Optimization System · Flight Operations</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, letterSpacing: '1.5px', color: '#6a7a90', textTransform: 'uppercase' }}>Unit System</span>
            <Toggle
              value={unitSys}
              options={[{ value: 'imperial', label: 'Imperial' }, { value: 'metric', label: 'Metric' }]}
              onChange={handleUnitSys}
            />
          </div>
        </div>

        {/* ── PANELS GRID ── */}
        <div className="avn-grid" style={{
          maxWidth: 1400, margin: '0 auto', padding: '20px 24px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        }}>

          {/* ── PANEL 1: ROUTE & AIRCRAFT ── */}
          <Panel num="01" title="Route & Aircraft">
            <Row2>
              <Field label="Departure Airport" error={errors.departure}>
                <input style={inputStyle(errors.departure)} value={inp.departure}
                  onChange={e => set('departure', e.target.value.toUpperCase())} maxLength={4} />
              </Field>
              <Field label="Destination Airport" error={errors.destination}>
                <input style={inputStyle(errors.destination)} value={inp.destination}
                  onChange={e => set('destination', e.target.value.toUpperCase())} maxLength={4} />
              </Field>
            </Row2>

            <Field label="Aircraft / Vehicle Type">
              <div className="avn-select-wrap">
                <select style={selectStyle} value={inp.aircraftType} onChange={e => set('aircraftType', e.target.value)}>
                  <option value="narrow">Narrow-body Jet (e.g. B737 / A320)</option>
                  <option value="wide">Wide-body Jet (e.g. B777 / A350)</option>
                  <option value="bizjet">Business Jet (e.g. G650 / Challenger)</option>
                  <option value="turboprop">Turboprop (e.g. King Air)</option>
                  <option value="helicopter">Helicopter (e.g. AW139 / S-76)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </Field>

            <Row2>
              <Field label="Route Distance">
                <InputWithSuffix type="number" suffix="NM" value={inp.distance} onChange={e => set('distance', +e.target.value)} />
              </Field>
              <Field label="Wind Component" tip="Positive = headwind, negative = tailwind. Affects fuel burn estimation but does not auto-adjust trip fuel — enter actual planned fuel from your OFP.">
                <InputWithSuffix type="number" suffix="kt HW+" value={inp.windComponent} onChange={e => set('windComponent', +e.target.value)} />
              </Field>
            </Row2>

            <Field label="Estimated Flight Time">
              <Row2>
                <InputWithSuffix type="number" suffix="HR"  min={0} max={24} value={inp.flightHours}   onChange={e => set('flightHours',   +e.target.value)} />
                <InputWithSuffix type="number" suffix="MIN" min={0} max={59} value={inp.flightMinutes} onChange={e => set('flightMinutes', +e.target.value)} />
              </Row2>
            </Field>
          </Panel>

          {/* ── PANEL 2: WEIGHT & PERFORMANCE ── */}
          <Panel num="02" title="Weight & Performance">
            <Field label="Fuel / Weight Unit">
              <Toggle
                value={inp.fuelUnit}
                options={[{ value:'lbs',label:'LBS' },{ value:'kg',label:'KG' },{ value:'gal',label:'GAL' },{ value:'liters',label:'LITERS' }]}
                onChange={v => set('fuelUnit', v)}
              />
            </Field>

            <Row2>
              <Field label={`MTOW (${unit})`}
                tip="Maximum Takeoff Weight — the maximum certified takeoff weight per the aircraft Type Certificate or AFM. Hard structural/performance limit."
                error={errors.mtow}>
                <input style={inputStyle(errors.mtow)} type="number" value={inp.mtow} onChange={e => set('mtow', +e.target.value)} />
              </Field>
              <Field label={`ZFW (${unit})`}
                tip="Zero Fuel Weight — aircraft operating empty weight plus all payload (passengers, bags, cargo, crew). Excludes all fuel. The loaded aircraft weight before fueling begins."
                error={errors.zfw}>
                <input style={inputStyle(errors.zfw)} type="number" value={inp.zfw} onChange={e => set('zfw', +e.target.value)} />
              </Field>
            </Row2>

            <Field label={`Trip Fuel Required (${unit})`}
              tip="Planned fuel burn from departure to destination under normal routing and altitude — taken directly from your computerized flight plan (CFP or OFP). Does not include reserves."
              error={errors.tripFuel}>
              <input style={inputStyle(errors.tripFuel)} type="number" value={inp.tripFuel} onChange={e => set('tripFuel', +e.target.value)} />
            </Field>

            <Field label={`Min. Landing Fuel / Reserves (${unit})`}
              tip="Minimum fuel at landing including: final reserve, alternate fuel (if req'd), additional company minima. This is the absolute floor — the tool will never recommend arriving below this.">
              <input style={inputStyle()} type="number" value={inp.minLandingFuel} onChange={e => set('minLandingFuel', +e.target.value)} />
            </Field>

            <Field label="Fuel Burn Penalty Rate (%)"
              tip="The fraction of extra fuel that gets burned due to the additional weight it adds. Typical range: 3–4% for jets. Example: carrying 1,000 lbs extra burns ≈35 lbs more at 3.5%, costing extra on every flight.">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: '#6a7a90' }}>1%</span>
                  <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 13, color: '#f0a500' }}>{inp.burnPenaltyRate.toFixed(1)}%</span>
                  <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: '#6a7a90' }}>8%</span>
                </div>
                <input type="range" min={1} max={8} step={0.1} value={inp.burnPenaltyRate}
                  onChange={e => set('burnPenaltyRate', +e.target.value)}
                  style={{ width: '100%', accentColor: '#f0a500', cursor: 'pointer' }} />
              </div>
            </Field>
          </Panel>

          {/* ── PANEL 3: FUEL PRICING & FEES ── */}
          <Panel num="03" title="Fuel Pricing & Fees">
            <Field label="Currency">
              <div className="avn-select-wrap">
                <select style={selectStyle} value={inp.currency} onChange={e => set('currency', e.target.value)}>
                  {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </Field>

            <Row2>
              <Field label={`Fuel Price — Departure (${sym}/${unit})`} error={errors.priceDep}>
                <input style={inputStyle(errors.priceDep)} type="number" step={0.001} value={inp.priceDep} onChange={e => set('priceDep', +e.target.value)} />
              </Field>
              <Field label={`Fuel Price — Destination (${sym}/${unit})`} error={errors.priceDest}>
                <input style={inputStyle(errors.priceDest)} type="number" step={0.001} value={inp.priceDest} onChange={e => set('priceDest', +e.target.value)} />
              </Field>
            </Row2>

            <Row2>
              <Field label={`Into-Plane Fee — Dep (${sym}/${unit})`}
                tip="Per-unit surcharge applied by the fuel supplier or FBO at departure, on top of the base fuel price.">
                <input style={inputStyle()} type="number" step={0.001} value={inp.upliftDep} onChange={e => set('upliftDep', +e.target.value)} />
              </Field>
              <Field label={`Into-Plane Fee — Dest (${sym}/${unit})`}
                tip="Per-unit surcharge at the destination FBO.">
                <input style={inputStyle()} type="number" step={0.001} value={inp.upliftDest} onChange={e => set('upliftDest', +e.target.value)} />
              </Field>
            </Row2>

            <Row2>
              <Field label={`Min. Purchase Req. (${unit})`}
                tip="Minimum uplift quantity required by the destination FBO. If you arrive with enough tankered fuel and purchase less than this, a ramp/handling fee may be charged instead.">
                <input style={inputStyle()} type="number" value={inp.minPurchaseReq} onChange={e => set('minPurchaseReq', +e.target.value)} />
              </Field>
              <Field label={`Ramp Fee if No Uplift (${sym})`}
                tip="Flat handling/landing fee charged by the destination FBO if you do not purchase fuel (or meet the minimum). Tankering may allow you to avoid this cost.">
                <input style={inputStyle()} type="number" value={inp.rampFee} onChange={e => set('rampFee', +e.target.value)} />
              </Field>
            </Row2>
          </Panel>

          {/* ── PANEL 4: REGULATORY & OPERATIONAL ── */}
          <Panel num="04" title="Regulatory & Operational">
            <Field label="Operation Type">
              <div className="avn-select-wrap">
                <select style={selectStyle} value={inp.operationType} onChange={e => set('operationType', e.target.value)}>
                  <option value="part91">Part 91 / General Aviation</option>
                  <option value="part135">Part 135 / Charter</option>
                  <option value="part121">Part 121 / Airline</option>
                  <option value="military">Military / Government</option>
                  <option value="easa">EASA OPS</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </Field>

            <Row2>
              <Field label="Alternate Airport Required?">
                <Toggle
                  value={inp.altRequired ? 'yes' : 'no'}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                  onChange={v => set('altRequired', v === 'yes')}
                />
              </Field>
              <Field label="International Flight?">
                <Toggle
                  value={inp.intlFlight ? 'yes' : 'no'}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                  onChange={v => set('intlFlight', v === 'yes')}
                />
              </Field>
            </Row2>

            {inp.altRequired && (
              <Field label={`Alternate Fuel (${unit})`}
                tip="Fuel required to divert from destination to the filed alternate airport, including required holding. Counted as part of minimum fuel reserves.">
                <input style={inputStyle()} type="number" value={inp.altFuel} onChange={e => set('altFuel', +e.target.value)} />
              </Field>
            )}

            <Row2>
              <Field label="Contingency Fuel (%)"
                tip="Buffer fuel carried above planned trip fuel, expressed as a percentage. Typical values: 5% (Part 121/EASA), 0–10% for Part 91. Applied to trip fuel before calculating available tankering capacity.">
                <InputWithSuffix type="number" suffix="%" min={0} max={15} step={0.5} value={inp.contingencyPct} onChange={e => set('contingencyPct', +e.target.value)} />
              </Field>
              <Field label="Fuel Tax Differential (%)"
                tip="Extra tax rate at the destination compared to departure, as a percentage of the destination fuel price. Common on international sectors where fuel is taxed at different rates. Enter 0 if unknown or same.">
                <InputWithSuffix type="number" suffix="%" min={0} max={50} step={0.5} value={inp.taxDiffPct} onChange={e => set('taxDiffPct', +e.target.value)} />
              </Field>
            </Row2>

            {inp.intlFlight && inp.taxDiffPct === 0 && (
              <div style={{
                background: '#1a1a0a', border: '1px solid #3a3010',
                borderRadius: 2, padding: '8px 12px', marginTop: 4,
                fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#c8a840',
              }}>
                ⚠ INTL FLIGHT: Verify fuel tax rates. Enter tax differential above if applicable.
              </div>
            )}
          </Panel>

          {/* ── ACTION BUTTONS ── */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
            <button onClick={handleRun} style={{
              flex: 1,
              background: 'linear-gradient(180deg, #182a1c 0%, #0e1a11 100%)',
              border: '2px solid #28a048', borderRadius: 3,
              color: '#38d068', padding: '15px 32px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 700, letterSpacing: '4px',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(40,160,72,0.35)'; e.currentTarget.style.borderColor = '#38d068'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#28a048'; }}
            >▶  RUN CALCULATION</button>

            <button onClick={handleReset} style={{
              background: 'transparent',
              border: '1px solid #1e2a3a', borderRadius: 3,
              color: '#4a5a70', padding: '15px 20px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 13, letterSpacing: '2px',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a50'; e.currentTarget.style.color = '#7a8aa0'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2a3a'; e.currentTarget.style.color = '#4a5a70'; }}
            >↺  RESET TO DEFAULTS</button>
          </div>

          {/* ── VALIDATION ERRORS SUMMARY ── */}
          {Object.keys(errors).length > 0 && (
            <div style={{
              gridColumn: '1 / -1',
              background: '#1e0c0c', border: '1px solid #6a2020',
              borderRadius: 3, padding: '12px 16px',
            }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#c04040', marginBottom: 6 }}>INPUT VALIDATION ERRORS</div>
              {Object.values(errors).map((e, i) => (
                <div key={i} style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#e05050', marginBottom: 3 }}>✗ {e}</div>
              ))}
            </div>
          )}

          {/* ── RESULTS ── */}
          {results && <ResultsPanel res={results} inp={inp} sym={sym} />}

        </div>

        {/* ── FOOTER ── */}
        <div style={{
          borderTop: '1px solid #1a2030', padding: '12px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          maxWidth: 1400, margin: '0 auto',
        }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5068' }}>
            FOR PLANNING PURPOSES ONLY · VERIFY ALL DATA AGAINST CERTIFIED PERFORMANCE DOCUMENTATION
          </span>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5068' }}>
            TANKER v1.0
          </span>
        </div>
      </div>
    </>
  );
}
