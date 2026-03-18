import { describe, it, expect } from 'vitest'
import { interpWeight, interpAltitude, interpBilinear } from '../engine/interpolation'
import { cj4 } from '../data/cj4_525c'

describe('interpWeight', () => {
  // CJ4 HSC fuel flow at FL390: [1298, 1298, 1298, 1300, 1305, 1311]
  // Weights:                     [17110, 16500, 16000, 15000, 14000, 12000]
  const weights = cj4.hsc.weights
  const ff390 = cj4.hsc.fuelFlow[12] // FL390 is index 12

  it('returns exact value at table weight', () => {
    expect(interpWeight(17110, weights, ff390)).toBe(1298)
    expect(interpWeight(15000, weights, ff390)).toBe(1300)
    expect(interpWeight(12000, weights, ff390)).toBe(1311)
  })

  it('clamps at boundary weights', () => {
    expect(interpWeight(18000, weights, ff390)).toBe(1298) // above max
    expect(interpWeight(10000, weights, ff390)).toBe(1311) // below min
  })

  it('interpolates midpoint between two weights', () => {
    // Between 15000 (1300) and 14000 (1305) at midpoint 14500
    const result = interpWeight(14500, weights, ff390)
    expect(result).toBeCloseTo(1302.5, 1)
  })

  it('interpolates between non-uniform weight spacing', () => {
    // Between 17110 (1298) and 16500 (1298) — both same, should be 1298
    expect(interpWeight(16800, weights, ff390)).toBeCloseTo(1298, 1)
  })

  it('handles null values gracefully', () => {
    // FL450: [null, 955, 970, 992, 1007, 1025]
    const ff450 = cj4.hsc.fuelFlow[15]
    // At 17110, value is null — should return the adjacent non-null
    expect(interpWeight(17110, weights, ff450)).toBeNull()
    // At 16500 (exact), should be 955
    expect(interpWeight(16500, weights, ff450)).toBe(955)
  })
})

describe('interpAltitude', () => {
  it('returns exact value at table altitude', () => {
    // CJ4 HSC KTAS at FL390 (index 12), weight 17110: 430
    const ktas17110 = cj4.hsc.ktas.map(row => row[0])
    const alts = cj4.hsc.altitudes
    expect(interpAltitude(39000, alts, ktas17110)).toBe(430)
  })

  it('interpolates between altitude rows', () => {
    // Between FL350 (442 KTAS) and FL370 (437 KTAS) at 17110 lb
    const ktas17110 = cj4.hsc.ktas.map(row => row[0])
    const alts = cj4.hsc.altitudes
    const result = interpAltitude(36000, alts, ktas17110)
    // FL350=442, FL370=437, midpoint at FL360 should be ~439.5
    expect(result).toBeCloseTo(439.5, 0)
  })

  it('clamps at boundary altitudes', () => {
    const ktas17110 = cj4.hsc.ktas.map(row => row[0])
    const alts = cj4.hsc.altitudes
    expect(interpAltitude(1000, alts, ktas17110)).toBe(278)   // below min
    expect(interpAltitude(50000, alts, ktas17110)).toBeNull()  // above max (null at FL450)
  })
})

describe('interpBilinear', () => {
  it('matches exact table values', () => {
    // CJ4 HSC, FL350, 15000 lb → 1614 lb/hr
    const result = interpBilinear(
      35000, 15000,
      cj4.hsc.altitudes, cj4.hsc.weights, cj4.hsc.fuelFlow
    )
    expect(result).toBe(1614)
  })

  it('interpolates in both dimensions simultaneously', () => {
    // Between FL350 and FL370, between 15000 and 14000 lb
    // FL350: 15000→1614, 14000→1594
    // FL370: 15000→1469, 14000→1470
    // At FL360, 14500: should be between these four values
    const result = interpBilinear(
      36000, 14500,
      cj4.hsc.altitudes, cj4.hsc.weights, cj4.hsc.fuelFlow
    )
    expect(result).not.toBeNull()
    // Rough sanity: should be between ~1470 and ~1614
    expect(result!).toBeGreaterThan(1460)
    expect(result!).toBeLessThan(1620)
  })

  it('demonstrates HSC vs LRC weight sensitivity (key insight)', () => {
    // At FL390:
    // HSC: 17110→1298, 12000→1311 (delta = -13 lb/hr! heavier burns LESS at HSC)
    // LRC: 17110→951,  12000→638  (delta = +313 lb/hr, heavier burns MUCH more)
    // This is because at HSC max cruise thrust, lighter aircraft flies faster,
    // which actually consumes more fuel. The weight sensitivity is negligible.
    const hscHeavy = interpBilinear(39000, 17110, cj4.hsc.altitudes, cj4.hsc.weights, cj4.hsc.fuelFlow)
    const hscLight = interpBilinear(39000, 12000, cj4.hsc.altitudes, cj4.hsc.weights, cj4.hsc.fuelFlow)
    const lrcHeavy = interpBilinear(39000, 17110, cj4.lrc.altitudes, cj4.lrc.weights, cj4.lrc.fuelFlow)
    const lrcLight = interpBilinear(39000, 12000, cj4.lrc.altitudes, cj4.lrc.weights, cj4.lrc.fuelFlow)

    const hscAbsDelta = Math.abs(hscHeavy! - hscLight!)
    const lrcDelta = lrcHeavy! - lrcLight!

    // HSC absolute delta should be tiny (~13 lb/hr) — barely changes with weight
    expect(hscAbsDelta).toBeLessThan(20)
    // LRC delta should be massive (~313 lb/hr) — huge weight sensitivity
    expect(lrcDelta).toBeGreaterThan(200)
    // THE key insight: LRC weight sensitivity is an order of magnitude larger
    expect(lrcDelta / hscAbsDelta).toBeGreaterThan(10)
  })
})

describe('climb interpolation', () => {
  it('returns exact climb fuel at table values', () => {
    // FL350, 17110 lb → 485 lb climb fuel
    const result = interpBilinear(
      35000, 17110,
      cj4.climb.altitudes, cj4.climb.weights, cj4.climb.fuel
    )
    expect(result).toBe(485)
  })

  it('climb fuel increases with weight', () => {
    const fuelHeavy = interpBilinear(39000, 17110, cj4.climb.altitudes, cj4.climb.weights, cj4.climb.fuel)
    const fuelLight = interpBilinear(39000, 14000, cj4.climb.altitudes, cj4.climb.weights, cj4.climb.fuel)
    expect(fuelHeavy!).toBeGreaterThan(fuelLight!)
  })

  it('climb distance increases with weight', () => {
    const distHeavy = interpBilinear(39000, 17110, cj4.climb.altitudes, cj4.climb.weights, cj4.climb.distance)
    const distLight = interpBilinear(39000, 14000, cj4.climb.altitudes, cj4.climb.weights, cj4.climb.distance)
    expect(distHeavy!).toBeGreaterThan(distLight!)
  })
})
