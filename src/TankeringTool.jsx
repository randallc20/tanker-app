// TankeringTool.jsx — Aviation Fuel Tankering Decision Tool
// Single self-contained React component. Requires recharts.

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    pageBg: '#0c0f16', panelBg: '#141820', headerBg: '#1a2030',
    border: '#1e2a3a', inputBg: '#0c0f16',
    text: '#dde3f0', textSec: '#8a9ab8', textMuted: '#506880',
    accent: '#f0a500', accentDim: '#c08800',
    toggleActiveBg: '#1e2d45', toggleActiveText: '#4db8ff', toggleText: '#7a8fa8',
    dropdownBg: '#141820', dropdownHover: '#1e2d45', dropdownBorder: '#2a3550',
    chartGrid: '#1a2535', chartAxis: '#6a7a90', chartAxisLine: '#1e2a3a',
    tipBg: '#1c2235', tipBorder: '#2a3550', tipText: '#b8c4d8',
    rowBorder: '#131a28', summaryBg: '#0f1219',
    headerGrad: 'linear-gradient(180deg,#141c28 0%,#0c0f16 100%)',
    runBtnBg: 'linear-gradient(180deg, #182a1c 0%, #0e1a11 100%)',
    runBtnBorder: '#28a048', runBtnGlow: 'rgba(40,160,72,0.35)',
    warnBg: '#1a1a0a', warnBorder: '#3a3010', warnText: '#c8a840',
    errBg: '#1e0c0c', errBorder: '#6a2020',
    shadow: 'rgba(0,0,0,0.6)',
  },
  light: {
    pageBg: '#f0f2f5', panelBg: '#ffffff', headerBg: '#eef1f6',
    border: '#d0d5dd', inputBg: '#ffffff',
    text: '#1a2030', textSec: '#4a5a70', textMuted: '#8a95a5',
    accent: '#c08800', accentDim: '#9a6e00',
    toggleActiveBg: '#d0e4ff', toggleActiveText: '#1a6dd0', toggleText: '#6a7a90',
    dropdownBg: '#ffffff', dropdownHover: '#e8f0ff', dropdownBorder: '#c0cad8',
    chartGrid: '#e0e4ea', chartAxis: '#6a7a90', chartAxisLine: '#d0d5dd',
    tipBg: '#ffffff', tipBorder: '#c0cad8', tipText: '#4a5a70',
    rowBorder: '#eef1f6', summaryBg: '#f6f8fa',
    headerGrad: 'linear-gradient(180deg,#e8ecf2 0%,#f0f2f5 100%)',
    runBtnBg: 'linear-gradient(180deg, #e8f5ec 0%, #d0ecd6 100%)',
    runBtnBorder: '#28a048', runBtnGlow: 'rgba(40,160,72,0.25)',
    warnBg: '#fef8e8', warnBorder: '#e0c860', warnText: '#8a6a00',
    errBg: '#fef0f0', errBorder: '#e0a0a0',
    shadow: 'rgba(0,0,0,0.15)',
  },
};

// ─── AIRCRAFT PRESETS (all values in US gallons — Jet-A ≈ 6.68 lb/gal) ──────
// mlw = max landing weight, maxFuel = max fuel capacity, payloadRate = $/lb displaced payload revenue
const AIRCRAFT_PRESETS = {
  narrow:     { mtow: 26077, mlw: 19611, maxFuel: 6287, zfw: 14970, minLandingFuel: 898, altFuel: 674, burnPenaltyRate: 3.5, sfc: 0.06 },
  wide:       { mtow: 52545, mlw: 41617, maxFuel: 15419, zfw: 28144, minLandingFuel: 1497, altFuel: 1048, burnPenaltyRate: 3.0, sfc: 0.055 },
  bizjet:     { mtow: 14910, mlw: 11527, maxFuel: 6114, zfw: 5494, minLandingFuel: 449, altFuel: 299, burnPenaltyRate: 4.0, sfc: 0.07 },
  turboprop:  { mtow: 2246, mlw: 2096, maxFuel: 539, zfw: 1497, minLandingFuel: 150, altFuel: 112, burnPenaltyRate: 4.5, sfc: 0.08 },
  helicopter: { mtow: 1018, mlw: 988, maxFuel: 299, zfw: 704, minLandingFuel: 75, altFuel: 45, burnPenaltyRate: 5.0, sfc: 0.09 },
  custom: null,
};

// Fuel burn per hour (gallons) by aircraft type
const FUEL_BURN_PER_HOUR = {
  narrow: 850, wide: 2800, bizjet: 450, turboprop: 100, helicopter: 110,
};

// Typical cruise ground speeds (kt) by aircraft type
const CRUISE_SPEEDS = {
  narrow: 450, wide: 490, bizjet: 470, turboprop: 270, helicopter: 140, custom: 450, '': 450,
};

// ─── WIND SCENARIOS ──────────────────────────────────────────────────────────
const WIND_SCENARIOS = [
  { value: 'extreme_tail', label: 'Extreme Tailwind',  kt: -100 },
  { value: 'strong_tail',  label: 'Strong Tailwind',   kt: -50 },
  { value: 'mod_tail',     label: 'Moderate Tailwind',  kt: -30 },
  { value: 'light_tail',   label: 'Light Tailwind',    kt: -15 },
  { value: 'calm',         label: 'Calm / Variable',   kt: 0 },
  { value: 'light_head',   label: 'Light Headwind',    kt: 15 },
  { value: 'mod_head',     label: 'Moderate Headwind',  kt: 30 },
  { value: 'strong_head',  label: 'Strong Headwind',   kt: 50 },
  { value: 'severe_head',  label: 'Severe Headwind',   kt: 80 },
  { value: 'extreme_head', label: 'Extreme Headwind',  kt: 100 },
];

// ─── ALTITUDE FUEL ADJUSTMENT ───────────────────────────────────────────────
// Optimal cruise altitude by aircraft type (FL = hundreds of feet)
const OPTIMAL_ALTITUDE = {
  narrow: 350, wide: 370, bizjet: 410, turboprop: 250, helicopter: 50, custom: 350, '': 350,
};

// Fuel burn correction factor based on deviation from optimal altitude
function altitudeFuelFactor(flightLevel, aircraftType) {
  if (!flightLevel || flightLevel <= 0) return 1;
  const optimal = OPTIMAL_ALTITUDE[aircraftType] || 350;
  const deviation = Math.abs(flightLevel - optimal);
  // ~2% increase per 100 FL deviation from optimal
  return 1 + 0.0002 * deviation;
}

function getWindKt(scenario) {
  return WIND_SCENARIOS.find(w => w.value === scenario)?.kt || 0;
}

// ─── DEFAULT LEG ─────────────────────────────────────────────────────────────
function createLeg(departure = '') {
  return {
    id: Math.random().toString(36).slice(2, 10),
    departure,
    destination: '',
    distance: '',
    flightHours: '',
    flightMinutes: '',
    windScenario: 'calm',
    cruiseFL: '',
    tripFuel: '',
    priceDep: '',
    priceDest: '',
    fboSurchargeDep: '',
    fboSurchargeDest: '',
    minPurchaseReq: '',
    rampFee: '',
    altRequired: true,
    altFuel: '',
    contingencyPct: '',
    taxDiffPct: '',
  };
}

const INITIAL_STATE = {
  aircraftType: '',
  fuelUnit: 'gal',
  mtow: '',
  mlw: '',
  maxFuel: '',
  zfw: '',
  minLandingFuel: '',
  burnPenaltyRate: 3.5,
  payloadRate: '',       // revenue per lb of displaced payload
  currency: 'USD',
  operationType: 'part121',
  legs: [createLeg('KHOU')],
};

// ─── UNIT CONVERSION ──────────────────────────────────────────────────────────
function toLbs(val, unit) {
  if (unit === 'kg')     return val * KG_TO_LBS;
  if (unit === 'gal')    return val * GAL_TO_LBS;
  if (unit === 'liters') return val * LIT_TO_LBS;
  return val;
}
function fromLbs(val, unit) {
  if (unit === 'kg')     return val * LBS_TO_KG;
  if (unit === 'gal')    return val * LBS_TO_GAL;
  if (unit === 'liters') return val * LBS_TO_LIT;
  return val;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function n(v) { return v === '' ? 0 : +v; }

// ─── CALCULATION ENGINE (Breguet-based with MLW, tank capacity, payload) ─────

// Breguet burn penalty: extra fuel burned to carry X extra lbs over a trip
// that normally burns tripFuel from a takeoff weight of baseWeight.
// Uses simplified Breguet: fuel_burned = W_initial * (1 - e^(-R*SFC/V))
// For the penalty: we compare burn at (baseWeight + X) vs burn at baseWeight.
// Approximation: burnPenalty(X) = tripFuel * (e^(X * k / baseWeight) - 1)
// where k ≈ burnPenaltyRate as a linearization anchor.
function breguetBurnPenalty(extraLbs, tripFuelLbs, baseWeightLbs, burnRateLinear) {
  if (baseWeightLbs <= 0 || tripFuelLbs <= 0 || extraLbs <= 0) return 0;
  // k calibrated so that at small X, dBurn/dX ≈ burnRateLinear
  // Breguet: burn(W) = W * (1 - e^(-c)) where c = R*SFC/(V*L/D)
  // c = -ln(1 - tripFuel/baseWeight) for the base case
  const fuelFrac = Math.min(tripFuelLbs / baseWeightLbs, 0.95);
  const c = -Math.log(1 - fuelFrac);
  // Burn at higher weight
  const newWeight = baseWeightLbs + extraLbs;
  const newBurn = newWeight * (1 - Math.exp(-c));
  const penalty = newBurn - tripFuelLbs;
  return Math.max(0, penalty);
}

function runCalc(shared, leg) {
  const unit = shared.fuelUnit;
  const mtow     = toLbs(n(shared.mtow), unit);
  const mlw      = toLbs(n(shared.mlw), unit);
  const maxFuelCap = toLbs(n(shared.maxFuel), unit);
  const zfw      = toLbs(n(shared.zfw), unit);
  const tripFuel = toLbs(n(leg.tripFuel), unit);
  const minLand  = toLbs(n(shared.minLandingFuel), unit);
  const altFuel  = leg.altRequired ? toLbs(n(leg.altFuel), unit) : 0;
  const minPurch = toLbs(n(leg.minPurchaseReq), unit);
  const burnRate = n(shared.burnPenaltyRate) / 100;
  const contPct  = n(leg.contingencyPct) / 100;
  const payloadRate = n(shared.payloadRate);  // $/lb displaced

  const tripEff  = tripFuel * (1 + contPct);
  const taxMult  = 1 + n(leg.taxDiffPct) / 100;
  const pDep     = n(leg.priceDep) + n(leg.fboSurchargeDep);
  const pDest    = (n(leg.priceDest) + n(leg.fboSurchargeDest)) * taxMult;

  // Base takeoff weight (without tankered fuel)
  const baseTOW = zfw + tripEff + minLand + altFuel;

  // === CONSTRAINT 1: MTOW headroom ===
  const mtowHeadroom = mtow > 0 ? Math.max(0, mtow - baseTOW) : Infinity;

  // === CONSTRAINT 2: MLW — landing weight must not exceed MLW ===
  // Landing weight = TOW - tripFuel burned + tankered - burn_penalty
  // Simplified: at landing you have ZFW + minLand + altFuel + (tanker - burnPenalty)
  // Must be ≤ MLW.  So tanker - burnPenalty ≤ MLW - ZFW - minLand - altFuel
  // Since burnPenalty grows with tanker, we solve iteratively.
  let mlwLimit = Infinity;
  if (mlw > 0) {
    const landBase = zfw + minLand + altFuel;
    const mlwRoom = Math.max(0, mlw - landBase);
    // Iterate to find max tanker such that tanker - burnPenalty(tanker) ≤ mlwRoom
    let lo = 0, hi = mtowHeadroom;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      const bp = breguetBurnPenalty(mid, tripEff, baseTOW, burnRate);
      if (mid - bp <= mlwRoom) lo = mid; else hi = mid;
    }
    mlwLimit = lo;
  }

  // === CONSTRAINT 3: Max fuel capacity ===
  // Total fuel on board = tripEff + minLand + altFuel + tanker + burnPenalty(tanker)
  let fuelCapLimit = Infinity;
  if (maxFuelCap > 0) {
    const baseFuel = tripEff + minLand + altFuel;
    const fuelRoom = Math.max(0, maxFuelCap - baseFuel);
    // tanker + burnPenalty(tanker) ≤ fuelRoom
    let lo = 0, hi = mtowHeadroom;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      const bp = breguetBurnPenalty(mid, tripEff, baseTOW, burnRate);
      if (mid + bp <= fuelRoom) lo = mid; else hi = mid;
    }
    fuelCapLimit = lo;
  }

  // Overall max tankerable
  const maxTankLbs = Math.max(0, Math.min(mtowHeadroom, mlwLimit, fuelCapLimit));

  // Which constraint is binding?
  let limitingFactor = 'mtow';
  if (maxTankLbs >= mtowHeadroom - 1) limitingFactor = 'mtow';
  if (mlwLimit <= mtowHeadroom && mlwLimit <= fuelCapLimit) limitingFactor = 'mlw';
  if (fuelCapLimit <= mtowHeadroom && fuelCapLimit <= mlwLimit) limitingFactor = 'fuel_cap';

  // === Find optimal tanker amount using Breguet burn ===
  // Net savings(X) = X * pDest - burnPenalty(X) * pDep - payloadDisplacement(X)
  // Payload displacement: if baseTOW + X + burnPenalty > MTOW, we must offload payload
  // payloadDisp(X) = max(0, baseTOW + X + burnPenalty(X) - mtow) * payloadRate
  // Since burnPenalty is nonlinear, we search for the optimum numerically.
  function netSavingsAt(xLbs) {
    const bp = breguetBurnPenalty(xLbs, tripEff, baseTOW, burnRate);
    const gross = xLbs * pDest;
    const carry = bp * pDep;
    // Payload displacement
    let payloadDisp = 0;
    if (mtow > 0 && payloadRate > 0) {
      const overweight = Math.max(0, baseTOW + xLbs + bp - mtow);
      payloadDisp = overweight * payloadRate;
    }
    let fee = 0;
    if (xLbs > 0 && minPurch > 0) {
      const stillNeeded = Math.max(0, minPurch - xLbs);
      if (stillNeeded <= 0) fee = n(leg.rampFee);
      else fee = -(stillNeeded * pDest);
    }
    return { net: gross - carry - payloadDisp + fee, gross, carry, bp, payloadDisp, fee };
  }

  // Search for optimal: sample across range and pick the best
  const SEARCH_STEPS = 200;
  let bestX = 0, bestNet = 0;
  for (let i = 0; i <= SEARCH_STEPS; i++) {
    const xLbs = (maxTankLbs / SEARCH_STEPS) * i;
    const { net } = netSavingsAt(xLbs);
    if (net > bestNet) { bestNet = net; bestX = xLbs; }
  }

  const opt = netSavingsAt(bestX);

  // Break-even: linear approximation still useful for display
  const breakEvenDelta = burnRate * pDep;
  const actualDelta    = pDest - pDep;

  // Sensitivity curve with Breguet burn
  const STEPS = 30;
  const sensitivityData = [];
  for (let i = 0; i <= STEPS; i++) {
    const xLbs = (maxTankLbs / STEPS) * i;
    const s = netSavingsAt(xLbs);
    sensitivityData.push({
      tanker:       Math.round(fromLbs(xLbs, unit)),
      grossSavings: Math.round(s.gross),
      costToCarry:  Math.round(s.carry),
      netSavings:   Math.round(s.net),
    });
  }

  return {
    maxTanker:    fromLbs(maxTankLbs, unit),
    optTanker:    fromLbs(bestX, unit),
    burnPenalty:  fromLbs(opt.bp, unit),
    grossSav:     opt.gross,
    costCarry:    opt.carry,
    payloadDisp:  opt.payloadDisp,
    feeAdj:       opt.fee,
    netSav:       opt.net,
    breakEvenDelta, actualDelta,
    sensitivityData, limitingFactor,
  };
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function validateLeg(shared, leg, index) {
  const errs = {};
  const pfx = index > 0 ? `Leg ${index + 1}: ` : '';
  if (!leg.departure || leg.departure.length < 3)   errs[`dep_${index}`] = `${pfx}Enter valid departure ICAO`;
  if (!leg.destination || leg.destination.length < 3) errs[`dest_${index}`] = `${pfx}Enter valid destination ICAO`;
  if (!n(shared.mtow))                 errs.mtow = 'MTOW is required';
  else if (n(shared.mtow) <= 0)       errs.mtow = 'MTOW must be > 0';
  if (!n(shared.zfw))                  errs.zfw = 'ZFW is required';
  else if (n(shared.zfw) <= 0)        errs.zfw = 'ZFW must be > 0';
  else if (n(shared.zfw) >= n(shared.mtow)) errs.zfw = 'ZFW must be less than MTOW';
  if (!n(leg.tripFuel))                errs[`trip_${index}`] = `${pfx}Trip fuel is required`;
  else if (n(leg.tripFuel) <= 0)      errs[`trip_${index}`] = `${pfx}Trip fuel must be > 0`;
  return errs;
}

// ─── AIRPORTS DATABASE (with coordinates) ───────────────────────────────────
const AIRPORTS = [
  { icao: 'KJFK', name: 'John F Kennedy Intl', city: 'New York', lat: 40.6398, lon: -73.7789 },
  { icao: 'KLAX', name: 'Los Angeles Intl', city: 'Los Angeles', lat: 33.9425, lon: -118.4081 },
  { icao: 'KORD', name: "O'Hare Intl", city: 'Chicago', lat: 41.9742, lon: -87.9073 },
  { icao: 'KATL', name: 'Hartsfield-Jackson Intl', city: 'Atlanta', lat: 33.6407, lon: -84.4277 },
  { icao: 'KDFW', name: 'Dallas/Fort Worth Intl', city: 'Dallas', lat: 32.8998, lon: -97.0403 },
  { icao: 'KDEN', name: 'Denver Intl', city: 'Denver', lat: 39.8561, lon: -104.6737 },
  { icao: 'KSFO', name: 'San Francisco Intl', city: 'San Francisco', lat: 37.6213, lon: -122.3790 },
  { icao: 'KSEA', name: 'Seattle-Tacoma Intl', city: 'Seattle', lat: 47.4502, lon: -122.3088 },
  { icao: 'KLAS', name: 'Harry Reid Intl', city: 'Las Vegas', lat: 36.0840, lon: -115.1537 },
  { icao: 'KMCO', name: 'Orlando Intl', city: 'Orlando', lat: 28.4312, lon: -81.3081 },
  { icao: 'KMIA', name: 'Miami Intl', city: 'Miami', lat: 25.7959, lon: -80.2870 },
  { icao: 'KBOS', name: 'Logan Intl', city: 'Boston', lat: 42.3656, lon: -71.0096 },
  { icao: 'KMSP', name: 'Minneapolis-Saint Paul Intl', city: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
  { icao: 'KDTW', name: 'Detroit Metro Wayne County', city: 'Detroit', lat: 42.2124, lon: -83.3534 },
  { icao: 'KPHL', name: 'Philadelphia Intl', city: 'Philadelphia', lat: 39.8721, lon: -75.2411 },
  { icao: 'KEWR', name: 'Newark Liberty Intl', city: 'Newark', lat: 40.6895, lon: -74.1745 },
  { icao: 'KLGA', name: 'LaGuardia', city: 'New York', lat: 40.7772, lon: -73.8726 },
  { icao: 'KIAH', name: 'George Bush Intercontinental', city: 'Houston', lat: 29.9844, lon: -95.3414 },
  { icao: 'KHOU', name: 'William P Hobby', city: 'Houston', lat: 29.6454, lon: -95.2789 },
  { icao: 'KNEW', name: 'Lakefront', city: 'New Orleans', lat: 30.0424, lon: -90.0283 },
  { icao: 'KHDC', name: 'Hammond Northshore Regional', city: 'Hammond', lat: 30.5216, lon: -90.4184 },
  { icao: 'KPHX', name: 'Phoenix Sky Harbor Intl', city: 'Phoenix', lat: 33.4373, lon: -112.0078 },
  { icao: 'KCLT', name: 'Charlotte Douglas Intl', city: 'Charlotte', lat: 35.2140, lon: -80.9431 },
  { icao: 'KDCA', name: 'Ronald Reagan Washington Natl', city: 'Washington', lat: 38.8512, lon: -77.0402 },
  { icao: 'KIAD', name: 'Washington Dulles Intl', city: 'Washington', lat: 38.9445, lon: -77.4558 },
  { icao: 'KBWI', name: 'Baltimore/Washington Intl', city: 'Baltimore', lat: 39.1754, lon: -76.6683 },
  { icao: 'KSLC', name: 'Salt Lake City Intl', city: 'Salt Lake City', lat: 40.7884, lon: -111.9778 },
  { icao: 'KSAN', name: 'San Diego Intl', city: 'San Diego', lat: 32.7336, lon: -117.1897 },
  { icao: 'KTPA', name: 'Tampa Intl', city: 'Tampa', lat: 27.9755, lon: -82.5332 },
  { icao: 'KPDX', name: 'Portland Intl', city: 'Portland', lat: 45.5898, lon: -122.5951 },
  { icao: 'KSTL', name: 'St Louis Lambert Intl', city: 'St Louis', lat: 38.7487, lon: -90.3700 },
  { icao: 'KMCI', name: 'Kansas City Intl', city: 'Kansas City', lat: 39.2976, lon: -94.7139 },
  { icao: 'PANC', name: 'Ted Stevens Anchorage Intl', city: 'Anchorage', lat: 61.1741, lon: -149.9962 },
  { icao: 'PHNL', name: 'Daniel K Inouye Intl', city: 'Honolulu', lat: 21.3187, lon: -157.9225 },
  { icao: 'EGLL', name: 'Heathrow', city: 'London', lat: 51.4700, lon: -0.4543 },
  { icao: 'EGKK', name: 'Gatwick', city: 'London', lat: 51.1481, lon: -0.1903 },
  { icao: 'EGLC', name: 'London City', city: 'London', lat: 51.5053, lon: 0.0553 },
  { icao: 'EGSS', name: 'Stansted', city: 'London', lat: 51.8850, lon: 0.2350 },
  { icao: 'EGGW', name: 'Luton', city: 'London', lat: 51.8747, lon: -0.3683 },
  { icao: 'EGBB', name: 'Birmingham', city: 'Birmingham', lat: 52.4539, lon: -1.7480 },
  { icao: 'EGCC', name: 'Manchester', city: 'Manchester', lat: 53.3537, lon: -2.2750 },
  { icao: 'EGPH', name: 'Edinburgh', city: 'Edinburgh', lat: 55.9500, lon: -3.3725 },
  { icao: 'LFPG', name: 'Charles de Gaulle', city: 'Paris', lat: 49.0097, lon: 2.5479 },
  { icao: 'LFPO', name: 'Orly', city: 'Paris', lat: 48.7233, lon: 2.3794 },
  { icao: 'EDDF', name: 'Frankfurt', city: 'Frankfurt', lat: 50.0379, lon: 8.5622 },
  { icao: 'EDDM', name: 'Munich', city: 'Munich', lat: 48.3538, lon: 11.7861 },
  { icao: 'EDDB', name: 'Berlin Brandenburg', city: 'Berlin', lat: 52.3514, lon: 13.4939 },
  { icao: 'EHAM', name: 'Schiphol', city: 'Amsterdam', lat: 52.3086, lon: 4.7639 },
  { icao: 'EBBR', name: 'Brussels', city: 'Brussels', lat: 50.9014, lon: 4.4844 },
  { icao: 'LSZH', name: 'Zurich', city: 'Zurich', lat: 47.4647, lon: 8.5492 },
  { icao: 'LOWW', name: 'Vienna Intl', city: 'Vienna', lat: 48.1103, lon: 16.5697 },
  { icao: 'LEMD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', lat: 40.4719, lon: -3.5626 },
  { icao: 'LEBL', name: 'Barcelona-El Prat', city: 'Barcelona', lat: 41.2971, lon: 2.0785 },
  { icao: 'LPPT', name: 'Lisbon Humberto Delgado', city: 'Lisbon', lat: 38.7742, lon: -9.1342 },
  { icao: 'LIRF', name: 'Leonardo da Vinci-Fiumicino', city: 'Rome', lat: 41.8003, lon: 12.2389 },
  { icao: 'LIMC', name: 'Milano Malpensa', city: 'Milan', lat: 45.6306, lon: 8.7281 },
  { icao: 'EKCH', name: 'Copenhagen Kastrup', city: 'Copenhagen', lat: 55.6180, lon: 12.6561 },
  { icao: 'ESSA', name: 'Stockholm Arlanda', city: 'Stockholm', lat: 59.6519, lon: 17.9186 },
  { icao: 'ENGM', name: 'Oslo Gardermoen', city: 'Oslo', lat: 60.1939, lon: 11.1004 },
  { icao: 'EFHK', name: 'Helsinki-Vantaa', city: 'Helsinki', lat: 60.3172, lon: 24.9633 },
  { icao: 'EIDW', name: 'Dublin', city: 'Dublin', lat: 53.4213, lon: -6.2701 },
  { icao: 'EPWA', name: 'Warsaw Chopin', city: 'Warsaw', lat: 52.1657, lon: 20.9671 },
  { icao: 'LKPR', name: 'Václav Havel Prague', city: 'Prague', lat: 50.1008, lon: 14.2600 },
  { icao: 'LGAV', name: 'Athens Intl', city: 'Athens', lat: 37.9364, lon: 23.9445 },
  { icao: 'LTFM', name: 'Istanbul', city: 'Istanbul', lat: 41.2753, lon: 28.7519 },
  { icao: 'OMDB', name: 'Dubai Intl', city: 'Dubai', lat: 25.2528, lon: 55.3644 },
  { icao: 'OMDW', name: 'Al Maktoum Intl (DWC)', city: 'Dubai', lat: 24.8967, lon: 55.1614 },
  { icao: 'OMAA', name: 'Abu Dhabi Intl', city: 'Abu Dhabi', lat: 24.4330, lon: 54.6511 },
  { icao: 'OTHH', name: 'Hamad Intl', city: 'Doha', lat: 25.2731, lon: 51.6081 },
  { icao: 'OEJN', name: 'King Abdulaziz Intl', city: 'Jeddah', lat: 21.6796, lon: 39.1565 },
  { icao: 'OERK', name: 'King Khalid Intl', city: 'Riyadh', lat: 24.9576, lon: 46.6988 },
  { icao: 'OBBI', name: 'Bahrain Intl', city: 'Bahrain', lat: 26.2708, lon: 50.6336 },
  { icao: 'OKBK', name: 'Kuwait Intl', city: 'Kuwait City', lat: 29.2266, lon: 47.9689 },
  { icao: 'VHHH', name: 'Hong Kong Intl', city: 'Hong Kong', lat: 22.3080, lon: 113.9185 },
  { icao: 'WSSS', name: 'Changi', city: 'Singapore', lat: 1.3502, lon: 103.9940 },
  { icao: 'RJTT', name: 'Tokyo Haneda', city: 'Tokyo', lat: 35.5494, lon: 139.7798 },
  { icao: 'RJAA', name: 'Tokyo Narita', city: 'Tokyo', lat: 35.7647, lon: 140.3864 },
  { icao: 'RKSI', name: 'Incheon Intl', city: 'Seoul', lat: 37.4691, lon: 126.4505 },
  { icao: 'ZBAD', name: 'Beijing Daxing', city: 'Beijing', lat: 39.5098, lon: 116.4105 },
  { icao: 'ZSPD', name: 'Shanghai Pudong', city: 'Shanghai', lat: 31.1443, lon: 121.8083 },
  { icao: 'ZGGG', name: 'Guangzhou Baiyun', city: 'Guangzhou', lat: 23.3924, lon: 113.2988 },
  { icao: 'RCTP', name: 'Taiwan Taoyuan Intl', city: 'Taipei', lat: 25.0777, lon: 121.2330 },
  { icao: 'VTBS', name: 'Suvarnabhumi', city: 'Bangkok', lat: 13.6900, lon: 100.7501 },
  { icao: 'WMKK', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', lat: 2.7456, lon: 101.7099 },
  { icao: 'WIII', name: 'Soekarno-Hatta Intl', city: 'Jakarta', lat: -6.1256, lon: 106.6558 },
  { icao: 'RPLL', name: 'Ninoy Aquino Intl', city: 'Manila', lat: 14.5086, lon: 121.0198 },
  { icao: 'VABB', name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai', lat: 19.0887, lon: 72.8679 },
  { icao: 'VIDP', name: 'Indira Gandhi Intl', city: 'Delhi', lat: 28.5562, lon: 77.1000 },
  { icao: 'YSSY', name: 'Sydney Kingsford Smith', city: 'Sydney', lat: -33.9461, lon: 151.1772 },
  { icao: 'YMML', name: 'Melbourne Tullamarine', city: 'Melbourne', lat: -37.6733, lon: 144.8433 },
  { icao: 'NZAA', name: 'Auckland', city: 'Auckland', lat: -37.0082, lon: 174.7850 },
  { icao: 'FAOR', name: 'O.R. Tambo Intl', city: 'Johannesburg', lat: -26.1392, lon: 28.2460 },
  { icao: 'HECA', name: 'Cairo Intl', city: 'Cairo', lat: 30.1219, lon: 31.4056 },
  { icao: 'GMMN', name: 'Mohammed V Intl', city: 'Casablanca', lat: 33.3675, lon: -7.5898 },
  { icao: 'DNMM', name: 'Murtala Muhammed Intl', city: 'Lagos', lat: 6.5774, lon: 3.3212 },
  { icao: 'HKJK', name: 'Jomo Kenyatta Intl', city: 'Nairobi', lat: -1.3192, lon: 36.9278 },
  { icao: 'SBGR', name: 'São Paulo-Guarulhos', city: 'São Paulo', lat: -23.4356, lon: -46.4731 },
  { icao: 'SCEL', name: 'Arturo Merino Benítez', city: 'Santiago', lat: -33.3930, lon: -70.7858 },
  { icao: 'SAEZ', name: 'Ministro Pistarini (Ezeiza)', city: 'Buenos Aires', lat: -34.8222, lon: -58.5358 },
  { icao: 'SKBO', name: 'El Dorado Intl', city: 'Bogotá', lat: 4.7016, lon: -74.1469 },
  { icao: 'MMMX', name: 'Benito Juárez Intl', city: 'Mexico City', lat: 19.4363, lon: -99.0721 },
  { icao: 'MMUN', name: 'Cancún Intl', city: 'Cancún', lat: 21.0365, lon: -86.8771 },
  { icao: 'CYYZ', name: 'Toronto Pearson Intl', city: 'Toronto', lat: 43.6772, lon: -79.6306 },
  { icao: 'CYVR', name: 'Vancouver Intl', city: 'Vancouver', lat: 49.1947, lon: -123.1839 },
  { icao: 'CYUL', name: 'Montréal-Trudeau Intl', city: 'Montréal', lat: 45.4706, lon: -73.7408 },
  { icao: 'CYYC', name: 'Calgary Intl', city: 'Calgary', lat: 51.1315, lon: -114.0106 },
];

const AIRPORT_MAP = Object.fromEntries(AIRPORTS.map(a => [a.icao, a]));

// ─── GREAT CIRCLE DISTANCE (haversine → NM) ─────────────────────────────────
function haversineNM(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function calcRouteInfo(depIcao, destIcao, aircraftType, windScenario, cruiseFL) {
  const dep = AIRPORT_MAP[depIcao];
  const dest = AIRPORT_MAP[destIcao];
  if (!dep || !dest) return null;
  const distNM = Math.round(haversineNM(dep.lat, dep.lon, dest.lat, dest.lon));
  const cruiseSpeed = CRUISE_SPEEDS[aircraftType] || 450;
  const windKt = getWindKt(windScenario);
  const effectiveSpeed = Math.max(50, cruiseSpeed - windKt);
  const totalMin = Math.round((distNM / effectiveSpeed) * 60);
  const burnRate = FUEL_BURN_PER_HOUR[aircraftType];
  const altFactor = altitudeFuelFactor(n(cruiseFL), aircraftType);
  const tripFuelGal = burnRate ? Math.round(burnRate * (totalMin / 60) * altFactor) : null;
  return { distance: distNM, hours: Math.floor(totalMin / 60), minutes: totalMin % 60, tripFuelGal };
}

// ─── THEMED STYLE HELPERS ───────────────────────────────────────────────────
const mkInputStyle = (t, error) => ({
  width: '100%', background: t.inputBg,
  border: `1px solid ${error ? '#c04040' : t.border}`,
  borderRadius: 2, color: t.text, padding: '7px 10px',
  fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
  outline: 'none', transition: 'border-color 0.15s',
});

const mkSelectStyle = (t) => ({
  width: '100%', background: t.inputBg,
  border: `1px solid ${t.border}`, borderRadius: 2,
  color: t.text, padding: '7px 30px 7px 10px',
  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14,
  outline: 'none', cursor: 'pointer', appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a6a85'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
});

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function InfoTip({ text, t }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 5 }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{ cursor: 'help', color: t.accent, fontSize: 13, lineHeight: 1 }}>&#9432;</span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%',
          transform: 'translateX(-50%)', background: t.tipBg,
          color: t.tipText, padding: '8px 12px', borderRadius: 3,
          fontSize: 12, width: 240, zIndex: 9999,
          border: `1px solid ${t.tipBorder}`, lineHeight: 1.6,
          boxShadow: `0 4px 16px ${t.shadow}`, pointerEvents: 'none',
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 400,
        }}>{text}</span>
      )}
    </span>
  );
}

function Field({ label, tip, error, t, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center',
        fontSize: 12, fontWeight: 600, letterSpacing: '1.2px',
        textTransform: 'uppercase', color: t.textSec, marginBottom: 6,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        {label}{tip && <InfoTip text={tip} t={t} />}
      </label>
      {children}
      {error && <div style={{ color: '#e05050', fontSize: 11, marginTop: 3, letterSpacing: '0.5px' }}>{error}</div>}
    </div>
  );
}

function Panel({ num, title, t, extra, children }) {
  return (
    <div style={{ background: t.panelBg, border: `1px solid ${t.border}`, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        background: t.headerBg, padding: '9px 16px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: t.textMuted }}>{num}</span>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: t.textSec, flex: 1,
        }}>{title}</span>
        {extra}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function Suffix({ t, children }) {
  return (
    <span style={{
      background: t.headerBg, border: `1px solid ${t.border}`, borderLeft: 'none',
      borderRadius: '0 2px 2px 0', padding: '7px 10px',
      fontSize: 12, color: t.textSec, whiteSpace: 'nowrap',
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.5px',
    }}>{children}</span>
  );
}

function InputWithSuffix({ suffix, error, t, ...props }) {
  return (
    <div style={{ display: 'flex' }}>
      <input style={{ ...mkInputStyle(t, error), borderRight: 'none', borderRadius: '2px 0 0 2px', flex: 1 }} {...props} />
      <Suffix t={t}>{suffix}</Suffix>
    </div>
  );
}

function Toggle({ value, options, onChange, t }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${t.border}`, borderRadius: 2, overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, border: 'none', cursor: 'pointer', padding: '7px 8px',
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
          letterSpacing: '0.5px', textTransform: 'uppercase',
          background: value === o.value ? t.toggleActiveBg : 'transparent',
          color: value === o.value ? t.toggleActiveText : t.toggleText,
          transition: 'all 0.15s',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function Row2({ children }) {
  return (
    <div className="avn-row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
  );
}

function AirportCombobox({ value, onChange, error, t, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    const q = (query || value || '').toUpperCase();
    if (!q) return AIRPORTS.slice(0, 20);
    return AIRPORTS.filter(a =>
      a.icao.includes(q) || a.name.toUpperCase().includes(q) || a.city.toUpperCase().includes(q)
    ).slice(0, 20);
  }, [query, value]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        style={{ ...mkInputStyle(t, error), opacity: disabled ? 0.6 : 1 }}
        value={value}
        onChange={e => { setQuery(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => !disabled && setOpen(true)}
        maxLength={4}
        placeholder="ICAO"
        readOnly={disabled}
      />
      {open && !disabled && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: t.dropdownBg, border: `1px solid ${t.dropdownBorder}`,
          borderRadius: '0 0 3px 3px', maxHeight: 200, overflowY: 'auto',
          zIndex: 9999, boxShadow: `0 8px 24px ${t.shadow}`,
        }}>
          {filtered.map(a => (
            <div key={a.icao}
              onMouseDown={() => { onChange(a.icao); setQuery(''); setOpen(false); inputRef.current?.blur(); }}
              style={{
                padding: '6px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: `1px solid ${t.headerBg}`, transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = t.dropdownHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: t.accent, minWidth: 42 }}>{a.icao}</span>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: t.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name} — {a.city}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartTip({ active, payload, label, sym, t }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: t.headerBg, border: `1px solid ${t.dropdownBorder}`, borderRadius: 3, padding: '8px 12px', fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
      <div style={{ color: t.textSec, marginBottom: 4 }}>{label}</div>
      {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {sym}{p.value?.toLocaleString()}</div>)}
    </div>
  );
}

// ─── RESULTS PANEL ────────────────────────────────────────────────────────────
function ResultsPanel({ res, leg, shared, sym, t, legIndex, totalLegs }) {
  const { maxTanker, optTanker, burnPenalty, grossSav, costCarry,
          payloadDisp, feeAdj, netSav, breakEvenDelta, actualDelta,
          sensitivityData, limitingFactor } = res;
  const unit = shared.fuelUnit;
  const fmtN = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtU = (n) => `${fmtN(n, 1)} ${unit}`;
  const fmtC = (n, d = 2) => `${n < 0 ? '-' : ''}${sym}${fmtN(Math.abs(n), d)}`;

  const limitLabels = { mtow: 'MTOW', mlw: 'MLW', fuel_cap: 'TANK CAPACITY' };

  let status = 'go';
  if (netSav <= 0) status = 'no-go';
  else if (netSav < 200 || (grossSav > 0 && netSav / grossSav < 0.05)) status = 'marginal';

  const badgeCfg = {
    go:       { bg: '#0a1e10', border: '#28a048', color: '#38d068', icon: '\u2713', label: 'TANKER FUEL',       sub: 'ECONOMICALLY ADVANTAGEOUS' },
    'no-go':  { bg: '#1e0a0a', border: '#a02828', color: '#e04040', icon: '\u2717', label: 'DO NOT TANKER',    sub: 'NOT ECONOMICALLY JUSTIFIED' },
    marginal: { bg: '#1e160a', border: '#b07020', color: '#f0a500', icon: '\u26A0', label: 'MARGINAL',          sub: 'NEAR BREAK-EVEN THRESHOLD' },
  };
  const bc = badgeCfg[status];

  const dataRows = [
    { label: 'Max Tankerable Fuel',       val: fmtU(maxTanker) },
    { label: 'Limiting Constraint',       val: limitLabels[limitingFactor] || 'MTOW', color: t.accent },
    { label: 'Recommended Tanker Amount', val: fmtU(optTanker), highlight: true },
    { label: 'Extra Burn (weight penalty)', val: fmtU(burnPenalty) },
    { label: 'Gross Savings',             val: fmtC(grossSav), color: '#38d068' },
    { label: 'Fuel Burn Cost',            val: `\u2212${sym}${fmtN(costCarry,2)}`, color: '#e04040' },
    ...(payloadDisp > 0 ? [{ label: 'Payload Displacement',   val: `\u2212${sym}${fmtN(payloadDisp,2)}`, color: '#e04040' }] : []),
    ...(feeAdj !== 0 ? [{ label: 'Fee Adjustment',            val: fmtC(feeAdj), color: feeAdj >= 0 ? '#38d068' : '#e04040' }] : []),
    { label: 'Price Difference',          val: `${sym}${fmtN(actualDelta,4)}/${unit}`, color: actualDelta > 0 ? '#38d068' : '#e04040' },
  ];

  const barData = [
    { name: 'GROSS', value: Math.round(grossSav), fill: '#28a048' },
    { name: 'CARRY',  value: Math.round(costCarry), fill: '#a02828' },
    { name: 'NET',    value: Math.round(netSav), fill: netSav >= 0 ? '#f0a500' : '#c03030' },
  ];

  const legLabel = totalLegs > 1 ? ` — LEG ${legIndex + 1}: ${leg.departure} \u2192 ${leg.destination}` : '';

  return (
    <div style={{ gridColumn: '1 / -1', background: t.panelBg, border: `1px solid ${t.border}`, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ background: t.headerBg, padding: '12px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: t.textSec }}>
          DECISION READOUT{legLabel}
        </div>
        <div style={{ background: bc.bg, border: `2px solid ${bc.border}`, borderRadius: 3, padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: bc.color }}>{bc.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: '2px', color: bc.color }}>{bc.label}</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: '1.5px', color: bc.border }}>{bc.sub}</div>
          </div>
        </div>
      </div>

      <div className="avn-data-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ borderRight: `1px solid ${t.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {dataRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${t.rowBorder}` }}>
                  <td style={{ padding: '9px 16px', fontSize: 12, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: t.textSec, fontFamily: "'Barlow Condensed', sans-serif", width: '56%' }}>{row.label}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'Share Tech Mono', monospace", fontSize: row.highlight ? 14 : 13, color: row.color || (row.highlight ? t.accent : t.text) }}>{row.val}</td>
                </tr>
              ))}
              <tr style={{ background: t.headerBg }}>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: t.text, fontFamily: "'Barlow Condensed', sans-serif" }}>NET SAVINGS</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: "'Share Tech Mono', monospace", fontSize: 22, fontWeight: 700, color: netSav >= 0 ? '#38d068' : '#e04040' }}>{fmtC(netSav)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: t.textMuted, marginBottom: 10 }}>SAVINGS BREAKDOWN</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: t.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }} axisLine={{ stroke: t.chartAxisLine }} tickLine={false} />
              <YAxis tick={{ fill: t.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }} tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <RCTooltip content={<ChartTip sym={sym} t={t} />} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ padding: '16px 20px', borderTop: `1px solid ${t.rowBorder}` }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase', color: t.textMuted, marginBottom: 10 }}>
          SENSITIVITY — NET SAVINGS vs TANKERED FUEL ({unit.toUpperCase()})
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={sensitivityData} margin={{ top: 4, right: 24, left: 12, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
            <XAxis dataKey="tanker" tick={{ fill: t.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              axisLine={{ stroke: t.chartAxisLine }} tickLine={false} />
            <YAxis tick={{ fill: t.chartAxis, fontSize: 10, fontFamily: 'Share Tech Mono' }}
              tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
            <RCTooltip content={<ChartTip sym={sym} t={t} />} />
            <ReferenceLine y={0} stroke={t.border} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="grossSavings" name="Gross Savings" stroke="#28a048" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="costToCarry"  name="Cost to Carry" stroke="#a02828" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="netSavings"   name="Net Savings"   stroke="#f0a500" strokeWidth={2}   dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── LEG CARD ────────────────────────────────────────────────────────────────
function LegCard({ leg, index, totalLegs, shared, errors, onUpdateLeg, onRemoveLeg, t }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const unit = shared.fuelUnit;
  const sym = CURRENCY_SYMBOLS[shared.currency] || '$';
  const setL = (k, v) => onUpdateLeg(index, k, v);
  const setLNum = (k, raw) => onUpdateLeg(index, k, raw === '' ? '' : +raw);
  const selectStyle = mkSelectStyle(t);

  const removeBtn = totalLegs > 1 ? (
    <button onClick={() => onRemoveLeg(index)} style={{
      background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 2,
      color: '#e04040', cursor: 'pointer', padding: '2px 8px',
      fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '1px',
    }}>&times; REMOVE</button>
  ) : null;

  return (
    <Panel num={String(index + 1).padStart(2, '0')} title={`Leg ${index + 1}: ${leg.departure || '?'} \u2192 ${leg.destination || '?'}`} t={t} extra={removeBtn}>
      {/* Route */}
      <Row2>
        <Field label={index === 0 ? 'Departure' : 'Departure (from prev leg)'} error={errors[`dep_${index}`]} t={t}>
          <AirportCombobox value={leg.departure} onChange={v => setL('departure', v)} error={errors[`dep_${index}`]} t={t} disabled={index > 0} />
        </Field>
        <Field label="Destination" error={errors[`dest_${index}`]} t={t}>
          <AirportCombobox value={leg.destination} onChange={v => setL('destination', v)} error={errors[`dest_${index}`]} t={t} />
        </Field>
      </Row2>

      <Row2>
        <Field label="Distance" t={t}>
          <InputWithSuffix type="number" suffix="NM" value={leg.distance} onChange={e => setLNum('distance', e.target.value)} t={t} />
        </Field>
        <Field label="Wind Conditions" t={t}>
          <div className="avn-select-wrap">
            <select style={selectStyle} value={leg.windScenario} onChange={e => setL('windScenario', e.target.value)}>
              {WIND_SCENARIOS.map(w => (
                <option key={w.value} value={w.value}>{w.label} ({w.kt >= 0 ? '+' : ''}{w.kt} kt)</option>
              ))}
            </select>
          </div>
        </Field>
      </Row2>

      <Row2>
        <Field label="Cruise Altitude" tip="Flight level (e.g. 350 = FL350). Affects fuel burn — lower or higher than optimal costs more fuel." t={t}>
          <InputWithSuffix type="number" suffix="FL" min={0} max={500} value={leg.cruiseFL} onChange={e => setLNum('cruiseFL', e.target.value)} placeholder="e.g. 350" t={t} />
        </Field>
        <Field label="Est. Flight Time" t={t}>
          <div style={{ display: 'flex', gap: 6 }}>
            <InputWithSuffix type="number" suffix="HR" min={0} max={24} value={leg.flightHours} onChange={e => setLNum('flightHours', e.target.value)} t={t} />
            <InputWithSuffix type="number" suffix="MIN" min={0} max={59} value={leg.flightMinutes} onChange={e => setLNum('flightMinutes', e.target.value)} t={t} />
          </div>
        </Field>
      </Row2>

      <Field label={`Trip Fuel (${unit})`} tip="Auto-estimated from route, aircraft & altitude. Override as needed." error={errors[`trip_${index}`]} t={t}>
        <input style={mkInputStyle(t, errors[`trip_${index}`])} type="number" value={leg.tripFuel} onChange={e => setLNum('tripFuel', e.target.value)} />
      </Field>

      {/* Pricing */}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 8, paddingTop: 12 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: t.textMuted, marginBottom: 10 }}>FUEL PRICING</div>
        <Row2>
          <Field label={`Price — Dep (${sym}/${unit})`} t={t}>
            <input style={mkInputStyle(t)} type="number" step={0.001} value={leg.priceDep} onChange={e => setLNum('priceDep', e.target.value)} />
          </Field>
          <Field label={`Price — Dest (${sym}/${unit})`} t={t}>
            <input style={mkInputStyle(t)} type="number" step={0.001} value={leg.priceDest} onChange={e => setLNum('priceDest', e.target.value)} />
          </Field>
        </Row2>
      </div>

      {/* Regulatory per-leg */}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 8, paddingTop: 12 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: t.textMuted, marginBottom: 10 }}>REGULATORY</div>
        <Field label="Alternate Required?" t={t}>
          <Toggle value={leg.altRequired ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={v => setL('altRequired', v === 'yes')} t={t} />
        </Field>
        {leg.altRequired && (
          <Field label={`Alternate Fuel (${unit})`} t={t}>
            <input style={mkInputStyle(t)} type="number" value={leg.altFuel} onChange={e => setLNum('altFuel', e.target.value)} />
          </Field>
        )}
      </div>

      {/* Advanced Options (collapsible) */}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 8, paddingTop: 8 }}>
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: t.accent, fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase',
          padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
          ADVANCED OPTIONS
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 10 }}>
            <Row2>
              <Field label={`FBO Surcharge — Dep (${sym}/${unit})`} tip="Fee charged by the FBO on top of fuel price (formerly into-plane fee)." t={t}>
                <input style={mkInputStyle(t)} type="number" step={0.001} value={leg.fboSurchargeDep} onChange={e => setLNum('fboSurchargeDep', e.target.value)} />
              </Field>
              <Field label={`FBO Surcharge — Dest (${sym}/${unit})`} t={t}>
                <input style={mkInputStyle(t)} type="number" step={0.001} value={leg.fboSurchargeDest} onChange={e => setLNum('fboSurchargeDest', e.target.value)} />
              </Field>
            </Row2>
            <Row2>
              <Field label={`Min Purchase (${unit})`} tip="Some FBOs require a minimum fuel purchase to waive ramp/parking fees. If tankering means you buy less at the destination, you may still need to meet this minimum." t={t}>
                <input style={mkInputStyle(t)} type="number" value={leg.minPurchaseReq} onChange={e => setLNum('minPurchaseReq', e.target.value)} />
              </Field>
              <Field label={`Ramp Fee (${sym})`} tip="Fee waived if minimum fuel purchase is met at destination." t={t}>
                <input style={mkInputStyle(t)} type="number" value={leg.rampFee} onChange={e => setLNum('rampFee', e.target.value)} />
              </Field>
            </Row2>
            <Row2>
              <Field label="Contingency (%)" tip="Extra fuel carried as a percentage of trip fuel for safety margin. Typical: 3-5%." t={t}>
                <InputWithSuffix type="number" suffix="%" min={0} max={15} step={0.5} value={leg.contingencyPct} onChange={e => setLNum('contingencyPct', e.target.value)} placeholder="0" t={t} />
              </Field>
              <Field label="Tax Differential (%)" tip="If destination fuel is taxed differently than departure fuel, enter the percentage difference here." t={t}>
                <InputWithSuffix type="number" suffix="%" min={0} max={50} step={0.5} value={leg.taxDiffPct} onChange={e => setLNum('taxDiffPct', e.target.value)} placeholder="0" t={t} />
              </Field>
            </Row2>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TankeringTool() {
  const [state, setState] = useState({ ...INITIAL_STATE, legs: [createLeg('KHOU')] });
  const [results, setResults] = useState(null);
  const [errors, setErrors] = useState({});
  const [unitSys, setUnitSys] = useState('imperial');
  const [theme, setTheme] = useState('dark');
  const [showAcAdvanced, setShowAcAdvanced] = useState(false);
  const t = THEMES[theme];

  const unit = state.fuelUnit;
  const sym = CURRENCY_SYMBOLS[state.currency] || '$';

  const setShared = useCallback((k, v) => setState(p => ({ ...p, [k]: v })), []);
  const setSharedNum = useCallback((k, raw) => setState(p => ({ ...p, [k]: raw === '' ? '' : +raw })), []);

  const updateLeg = useCallback((index, key, value) => {
    setState(prev => {
      const legs = [...prev.legs];
      legs[index] = { ...legs[index], [key]: value };
      if (key === 'destination' && index < legs.length - 1) {
        legs[index + 1] = { ...legs[index + 1], departure: value };
      }
      return { ...prev, legs };
    });
  }, []);

  const addLeg = useCallback(() => {
    setState(prev => {
      const lastDest = prev.legs[prev.legs.length - 1].destination;
      return { ...prev, legs: [...prev.legs, createLeg(lastDest)] };
    });
  }, []);

  const removeLeg = useCallback((index) => {
    setState(prev => {
      if (prev.legs.length <= 1) return prev;
      const legs = prev.legs.filter((_, i) => i !== index);
      for (let i = 1; i < legs.length; i++) {
        legs[i] = { ...legs[i], departure: legs[i - 1].destination };
      }
      return { ...prev, legs };
    });
  }, []);

  const handleAircraftType = useCallback((type) => {
    setState(prev => {
      const preset = AIRCRAFT_PRESETS[type];
      if (!preset) return { ...prev, aircraftType: type };
      const convert = (v) => Math.round(fromLbs(toLbs(v, 'gal'), prev.fuelUnit));
      return {
        ...prev,
        aircraftType: type,
        mtow: convert(preset.mtow),
        mlw: convert(preset.mlw),
        maxFuel: convert(preset.maxFuel),
        zfw: convert(preset.zfw),
        minLandingFuel: convert(preset.minLandingFuel),
        burnPenaltyRate: preset.burnPenaltyRate,
        legs: prev.legs.map(leg => ({ ...leg, altFuel: convert(preset.altFuel) })),
      };
    });
  }, []);

  // Auto-calculate route info and trip fuel for each leg
  useEffect(() => {
    setState(prev => {
      let changed = false;
      const newLegs = prev.legs.map(leg => {
        const info = calcRouteInfo(leg.departure, leg.destination, prev.aircraftType, leg.windScenario, leg.cruiseFL);
        if (!info) return leg;
        const updates = {};
        if (leg.distance !== info.distance) updates.distance = info.distance;
        if (leg.flightHours !== info.hours) updates.flightHours = info.hours;
        if (leg.flightMinutes !== info.minutes) updates.flightMinutes = info.minutes;
        if (info.tripFuelGal != null) {
          const est = Math.round(fromLbs(toLbs(info.tripFuelGal, 'gal'), prev.fuelUnit));
          if (leg.tripFuel === '' || leg.tripFuel !== est) updates.tripFuel = est;
        }
        if (Object.keys(updates).length === 0) return leg;
        changed = true;
        return { ...leg, ...updates };
      });
      return changed ? { ...prev, legs: newLegs } : prev;
    });
  }, [
    state.legs.map(l => `${l.departure}|${l.destination}|${l.windScenario}|${l.cruiseFL}`).join(','),
    state.aircraftType,
  ]);

  const handleUnitSys = useCallback((sys) => {
    if (sys === unitSys) return;
    const targetUnit = sys === 'metric' ? 'liters' : 'gal';
    setState(prev => {
      const convert = (v) => v === '' ? '' : Math.round(fromLbs(toLbs(v, prev.fuelUnit), targetUnit));
      return {
        ...prev,
        mtow: convert(prev.mtow),
        mlw: convert(prev.mlw),
        maxFuel: convert(prev.maxFuel),
        zfw: convert(prev.zfw),
        minLandingFuel: convert(prev.minLandingFuel),
        fuelUnit: targetUnit,
        legs: prev.legs.map(leg => ({
          ...leg,
          tripFuel: convert(leg.tripFuel),
          altFuel: convert(leg.altFuel),
          minPurchaseReq: convert(leg.minPurchaseReq),
          fboSurchargeDep: leg.fboSurchargeDep,
          fboSurchargeDest: leg.fboSurchargeDest,
        })),
      };
    });
    setUnitSys(sys);
  }, [unitSys]);

  const handleRun = useCallback(() => {
    let allErrors = {};
    state.legs.forEach((leg, i) => {
      Object.assign(allErrors, validateLeg(state, leg, i));
    });
    setErrors(allErrors);
    if (Object.keys(allErrors).length) { setResults(null); return; }
    const legResults = state.legs.map(leg => runCalc(state, leg));
    setResults(legResults);
  }, [state]);

  const handleReset = useCallback(() => {
    setState({ ...INITIAL_STATE, legs: [createLeg('KHOU')] });
    setResults(null);
    setErrors({});
    setUnitSys('imperial');
  }, []);

  const totalNetSavings = results ? results.reduce((sum, r) => sum + r.netSav, 0) : 0;
  const selectStyle = mkSelectStyle(t);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${t.pageBg}; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input:focus, select:focus { border-color: ${t.accent} !important; }
        input[type=range] { accent-color: ${t.accent}; }
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
          .avn-row2 { grid-template-columns: 1fr !important; }
          .avn-header { flex-direction: column !important; align-items: flex-start !important; }
          .avn-header-controls { width: 100%; justify-content: space-between !important; }
        }
        @media (max-width: 480px) {
          .avn-grid { padding: 10px 12px !important; gap: 10px !important; }
          .avn-header { padding: 10px 12px !important; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: t.pageBg, color: t.text, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {/* HEADER */}
        <div className="avn-header" style={{
          background: t.headerGrad, borderBottom: `1px solid ${t.border}`,
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', color: t.accent }}>
              TANKER FUEL DECISION TOOL
            </div>
            <div style={{ fontSize: 11, letterSpacing: '2.5px', color: t.textMuted, textTransform: 'uppercase', marginTop: 2 }}>
              Aviation Fuel Optimization System
            </div>
          </div>
          <div className="avn-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '1.5px', color: t.textMuted, textTransform: 'uppercase' }}>Theme</span>
              <Toggle value={theme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={setTheme} t={t} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '1.5px', color: t.textMuted, textTransform: 'uppercase' }}>Units</span>
              <Toggle value={unitSys} options={[{ value: 'imperial', label: 'Imperial' }, { value: 'metric', label: 'Metric' }]} onChange={handleUnitSys} t={t} />
            </div>
          </div>
        </div>

        {/* PANELS GRID */}
        <div className="avn-grid" style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* SHARED: AIRCRAFT & WEIGHT */}
          <Panel num="AC" title="Aircraft & Weight" t={t}>
            <Field label="Aircraft / Vehicle Type" t={t}>
              <div className="avn-select-wrap">
                <select style={selectStyle} value={state.aircraftType} onChange={e => handleAircraftType(e.target.value)}>
                  <option value="">— Select Aircraft —</option>
                  <option value="narrow">Narrow-body (B737 / A320)</option>
                  <option value="wide">Wide-body (B777 / A350)</option>
                  <option value="bizjet">Business Jet (G650 / Challenger)</option>
                  <option value="turboprop">Turboprop (King Air)</option>
                  <option value="helicopter">Helicopter (AW139 / S-76)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </Field>

            <Field label="Fuel / Weight Unit" t={t}>
              <Toggle value={unit} options={[{ value:'lbs',label:'LBS' },{ value:'kg',label:'KG' },{ value:'gal',label:'GAL' },{ value:'liters',label:'LITERS' }]} onChange={v => setShared('fuelUnit', v)} t={t} />
            </Field>

            <Row2>
              <Field label={`MTOW (${unit})`} tip="Maximum Takeoff Weight — hard structural limit." error={errors.mtow} t={t}>
                <input style={mkInputStyle(t, errors.mtow)} type="number" value={state.mtow} onChange={e => setSharedNum('mtow', e.target.value)} />
              </Field>
              <Field label={`MLW (${unit})`} tip="Maximum Landing Weight — if tankered fuel isn't burned off, you may exceed this. Limits tankering on short legs." t={t}>
                <input style={mkInputStyle(t)} type="number" value={state.mlw} onChange={e => setSharedNum('mlw', e.target.value)} />
              </Field>
            </Row2>

            <Row2>
              <Field label={`ZFW (${unit})`} tip="Zero Fuel Weight — aircraft + payload, no fuel." error={errors.zfw} t={t}>
                <input style={mkInputStyle(t, errors.zfw)} type="number" value={state.zfw} onChange={e => setSharedNum('zfw', e.target.value)} />
              </Field>
              <Field label={`Max Fuel Capacity (${unit})`} tip="Maximum fuel the tanks can hold. Hard limit regardless of weight." t={t}>
                <input style={mkInputStyle(t)} type="number" value={state.maxFuel} onChange={e => setSharedNum('maxFuel', e.target.value)} />
              </Field>
            </Row2>

            <Field label={`Min Landing Fuel (${unit})`} tip="Minimum fuel at landing including reserves." t={t}>
              <input style={mkInputStyle(t)} type="number" value={state.minLandingFuel} onChange={e => setSharedNum('minLandingFuel', e.target.value)} />
            </Field>

            <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 8, paddingTop: 8 }}>
              <button onClick={() => setShowAcAdvanced(!showAcAdvanced)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: t.accent, fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: showAcAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
                ADVANCED
              </button>
              {showAcAdvanced && (
                <div style={{ marginTop: 10 }}>
                  <Field label="Burn Penalty Rate (%)" tip="Extra fuel burned due to carrying additional weight. 3-4% typical for jets. Auto-set when you select an aircraft type." t={t}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: t.textMuted }}>1%</span>
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 13, color: t.accent }}>{n(state.burnPenaltyRate).toFixed(1)}%</span>
                        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: t.textMuted }}>8%</span>
                      </div>
                      <input type="range" min={1} max={8} step={0.1} value={state.burnPenaltyRate}
                        onChange={e => setSharedNum('burnPenaltyRate', e.target.value)}
                        style={{ width: '100%', cursor: 'pointer' }} />
                    </div>
                  </Field>
                  <Field label="Payload Displacement Rate ($/lb)" tip="Revenue lost per pound of cargo/passengers offloaded to make room for tankered fuel. Leave blank or 0 if payload is fixed." t={t}>
                    <input style={mkInputStyle(t)} type="number" step={0.01} value={state.payloadRate} onChange={e => setSharedNum('payloadRate', e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
          </Panel>

          {/* SHARED: OPERATIONS */}
          <Panel num="OP" title="Operations & Currency" t={t}>
            <Field label="Operation Type" t={t}>
              <div className="avn-select-wrap">
                <select style={selectStyle} value={state.operationType} onChange={e => setShared('operationType', e.target.value)}>
                  <option value="part91">Part 91 / General Aviation</option>
                  <option value="part135">Part 135 / Charter</option>
                  <option value="part121">Part 121 / Airline</option>
                  <option value="military">Military / Government</option>
                  <option value="easa">EASA OPS</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </Field>
            <Field label="Currency" t={t}>
              <div className="avn-select-wrap">
                <select style={selectStyle} value={state.currency} onChange={e => setShared('currency', e.target.value)}>
                  {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </Field>
          </Panel>

          {/* LEG CARDS */}
          {state.legs.map((leg, i) => (
            <LegCard
              key={leg.id}
              leg={leg}
              index={i}
              totalLegs={state.legs.length}
              shared={state}
              errors={errors}
              onUpdateLeg={updateLeg}
              onRemoveLeg={removeLeg}
              t={t}
            />
          ))}

          {/* ADD LEG BUTTON */}
          <div style={{ gridColumn: '1 / -1' }}>
            <button onClick={addLeg} style={{
              width: '100%', background: 'transparent',
              border: `2px dashed ${t.border}`, borderRadius: 3,
              color: t.textSec, padding: '14px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 15, fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textSec; }}
            >+ ADD LEG</button>
          </div>

          {/* ACTION BUTTONS */}
          <div className="avn-row2" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
            <button onClick={handleRun} style={{
              background: t.runBtnBg, border: `2px solid ${t.runBtnBorder}`, borderRadius: 3,
              color: '#38d068', padding: '15px 32px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 700, letterSpacing: '4px',
              textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 24px ${t.runBtnGlow}`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            >&#9654;  RUN CALCULATION</button>

            <button onClick={handleReset} style={{
              background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 3,
              color: t.textMuted, padding: '15px 20px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 13, letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer',
            }}>&#8634;  RESET</button>
          </div>

          {/* VALIDATION ERRORS */}
          {Object.keys(errors).length > 0 && (
            <div style={{ gridColumn: '1 / -1', background: t.errBg, border: `1px solid ${t.errBorder}`, borderRadius: 3, padding: '12px 16px' }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#c04040', marginBottom: 6 }}>VALIDATION ERRORS</div>
              {Object.values(errors).map((e, i) => (
                <div key={i} style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#e05050', marginBottom: 3 }}>{'\u2717'} {e}</div>
              ))}
            </div>
          )}

          {/* TOTAL SUMMARY (multi-leg) */}
          {results && results.length > 1 && (
            <div style={{
              gridColumn: '1 / -1', background: t.headerBg, border: `2px solid ${totalNetSavings >= 0 ? '#28a048' : '#a02828'}`,
              borderRadius: 3, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: t.textSec }}>
                TOTAL ACROSS {results.length} LEGS
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 28, fontWeight: 700, color: totalNetSavings >= 0 ? '#38d068' : '#e04040' }}>
                {totalNetSavings < 0 ? '-' : ''}{sym}{Math.abs(totalNetSavings).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}

          {/* PER-LEG RESULTS */}
          {results && results.map((res, i) => (
            <ResultsPanel key={i} res={res} leg={state.legs[i]} shared={state} sym={sym} t={t} legIndex={i} totalLegs={state.legs.length} />
          ))}
        </div>

        {/* FOOTER */}
        <div style={{
          borderTop: `1px solid ${t.headerBg}`, padding: '12px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          maxWidth: 1400, margin: '0 auto',
        }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: t.textMuted }}>
            FOR PLANNING PURPOSES ONLY
          </span>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: t.textMuted }}>
            TANKER v2.0
          </span>
        </div>
      </div>
    </>
  );
}
