import { describe, it, expect } from 'vitest'
import { calculateTankering, sensitivitySweep } from '../engine/tankering_calc'
import { TankeringInputs } from '../data/types'

const baseInputs: TankeringInputs = {
  aircraftId: 'cj4_525c',
  cruiseMode: 'hsc',
  cruiseAltitude: 39000,
  tripDistance: 500,
  plannedCruiseWeight: 15000,
  tankerAmount_lb: 500,
  windComponent: 0,
  forecastTemp_c: null,
  departureElevation: 0,
  originPrice: 5.00,
  destPrice: 7.00,
  fuelDensity: 6.7,
  descentDistance: 50,
}

describe('calculateTankering', () => {
  it('produces a valid result for standard inputs', () => {
    const r = calculateTankering(baseInputs)
    expect(r.ffNormal).toBeGreaterThan(0)
    expect(r.ffHeavy).toBeGreaterThan(0)
    expect(r.cruiseKtas).toBeGreaterThan(0)
    expect(r.cruiseTime_hrs).toBeGreaterThan(0)
    expect(r.totalPenalty_lb).toBeGreaterThanOrEqual(0)
  })

  it('gross savings equals tanker gal × price diff', () => {
    const r = calculateTankering(baseInputs)
    const tankerGal = baseInputs.tankerAmount_lb / baseInputs.fuelDensity
    const expectedGross = tankerGal * (baseInputs.destPrice - baseInputs.originPrice)
    expect(r.grossSavings).toBeCloseTo(expectedGross, 2)
  })

  it('net savings = gross - penalty cost', () => {
    const r = calculateTankering(baseInputs)
    expect(r.netSavings).toBeCloseTo(r.grossSavings - r.penaltyCost, 2)
  })

  it('shows much higher penalty for LRC than HSC (key insight)', () => {
    const hscResult = calculateTankering({ ...baseInputs, cruiseMode: 'hsc' })
    const lrcResult = calculateTankering({ ...baseInputs, cruiseMode: 'lrc' })

    // LRC has dramatically higher fuel flow sensitivity to weight.
    // At HSC/FL390, fuel flow barely changes with weight (even slightly negative delta!).
    // At LRC/FL390, fuel flow changes by ~60 lb/hr per 1000 lb of weight.
    expect(Math.abs(lrcResult.ffDelta)).toBeGreaterThan(Math.abs(hscResult.ffDelta) * 3)
    // LRC total penalty (cruise + climb) should be much larger
    expect(lrcResult.totalPenalty_lb).toBeGreaterThan(hscResult.totalPenalty_lb)
  })

  it('headwind increases cruise time and absolute penalty at LRC', () => {
    // Use LRC where cruise penalty is clearly positive
    const calm = calculateTankering({ ...baseInputs, cruiseMode: 'lrc', windComponent: 0 })
    const headwind = calculateTankering({ ...baseInputs, cruiseMode: 'lrc', windComponent: 50 })
    expect(headwind.cruiseTime_hrs).toBeGreaterThan(calm.cruiseTime_hrs)
    expect(headwind.cruisePenalty_lb).toBeGreaterThan(calm.cruisePenalty_lb)
  })

  it('tailwind reduces cruise time and penalty at LRC', () => {
    const calm = calculateTankering({ ...baseInputs, cruiseMode: 'lrc', windComponent: 0 })
    const tailwind = calculateTankering({ ...baseInputs, cruiseMode: 'lrc', windComponent: -50 })
    expect(tailwind.cruiseTime_hrs).toBeLessThan(calm.cruiseTime_hrs)
    expect(tailwind.cruisePenalty_lb).toBeLessThan(calm.cruisePenalty_lb)
  })

  it('tankering 0 lb gives zero penalty', () => {
    const r = calculateTankering({ ...baseInputs, tankerAmount_lb: 0 })
    expect(r.totalPenalty_lb).toBe(0)
    expect(r.cruisePenalty_lb).toBe(0)
    expect(r.climbPenalty_lb).toBe(0)
  })

  it('warns when tankered weight exceeds MTOW', () => {
    const overweight = calculateTankering({
      ...baseInputs,
      plannedCruiseWeight: 16500,
      tankerAmount_lb: 2000,
    })
    expect(overweight.warnings.some(w => w.includes('MTOW'))).toBe(true)
  })

  it('warns when cruise weight is below table minimum', () => {
    const light = calculateTankering({
      ...baseInputs,
      plannedCruiseWeight: 11000,
      tankerAmount_lb: 200,
    })
    expect(light.warnings.some(w => w.includes('12,000'))).toBe(true)
  })

  it('applies ISA correction when temperature provided', () => {
    const isa = calculateTankering({ ...baseInputs, forecastTemp_c: null })
    // ISA at FL390 ≈ -56.5°C. Providing -40°C = ISA+16.5
    const hot = calculateTankering({ ...baseInputs, forecastTemp_c: -40 })
    expect(hot.isaTempCorrection).toBeGreaterThan(1)
    expect(hot.ffHeavy).toBeGreaterThan(isa.ffHeavy)
  })

  it('includes rule of thumb comparison', () => {
    const r = calculateTankering(baseInputs)
    expect(r.ruleOfThumb).toBeDefined()
    // Rule of thumb uses flat fuel flow, so penalty is 0
    expect(r.ruleOfThumb!.penaltyCost).toBe(0)
    // Therefore rule of thumb net savings = gross savings (no penalty)
    expect(r.ruleOfThumb!.netSavings).toBeCloseTo(r.grossSavings, 2)
  })
})

describe('sensitivitySweep', () => {
  it('generates price diff sensitivity data', () => {
    const data = sensitivitySweep(baseInputs, 'priceDiff', 10)
    expect(data.length).toBe(11) // 0..10 inclusive
    // At negative price diff (dest cheaper), should not be worth tankering
    expect(data[0].netSavings).toBeLessThan(0)
    // At large positive diff, should be worth it
    expect(data[data.length - 1].netSavings).toBeGreaterThan(0)
  })

  it('generates wind sensitivity data', () => {
    // Use LRC where wind clearly affects penalty (positive cruise penalty)
    const lrcInputs = { ...baseInputs, cruiseMode: 'lrc' as const }
    const data = sensitivitySweep(lrcInputs, 'wind', 10)
    expect(data.length).toBe(11)
    // Tailwind case (index 0, -100kt) should have higher savings than headwind (last)
    expect(data[0].netSavings).toBeGreaterThan(data[data.length - 1].netSavings)
  })

  it('generates tanker amount sensitivity data', () => {
    const data = sensitivitySweep(baseInputs, 'tankerAmount', 10)
    expect(data.length).toBe(11)
    expect(data[0].netSavings).toBeCloseTo(0, 1) // 0 gal = 0 savings
  })
})
