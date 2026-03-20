import { describe, it, expect } from 'vitest';
import {
  flightTime,
  effectiveGroundspeed,
  computeLegBurn,
  burnPenalty,
  deliveredFuel,
  deliveryRatio,
  compoundDeliveryRatio,
  effectiveDeliveredCost,
  breakEvenPrice,
  savingsPerGal,
} from '../calculations';

// ---------------------------------------------------------------------------
// 4.4 Delivery Ratio
// ---------------------------------------------------------------------------
describe('deliveryRatio', () => {
  it('2-hour leg at 3.5%/hr = exactly 0.930', () => {
    // DR = 1 - (3.5/100) * 2 = 1 - 0.07 = 0.93
    expect(deliveryRatio(3.5, 2)).toBeCloseTo(0.93, 10);
  });

  it('zero flight time yields ratio of 1.0', () => {
    expect(deliveryRatio(3.5, 0)).toBe(1);
  });

  it('returns 0 when penalty rate * time >= 100%', () => {
    // 50%/hr for 2 hrs = 100% loss
    expect(deliveryRatio(50, 2)).toBe(0);
  });
});

describe('compoundDeliveryRatio', () => {
  it('two 2-hour legs at 3.5%/hr = 0.930 x 0.930 = 0.8649', () => {
    const legs = [
      { burnPenaltyPctPerHr: 3.5, flightTimeHrs: 2 },
      { burnPenaltyPctPerHr: 3.5, flightTimeHrs: 2 },
    ];
    expect(compoundDeliveryRatio(legs)).toBeCloseTo(0.93 * 0.93, 6);
    expect(compoundDeliveryRatio(legs)).toBeCloseTo(0.8649, 4);
  });

  it('single leg equals deliveryRatio directly', () => {
    const legs = [{ burnPenaltyPctPerHr: 2.5, flightTimeHrs: 1.5 }];
    expect(compoundDeliveryRatio(legs)).toBeCloseTo(deliveryRatio(2.5, 1.5), 10);
  });

  it('returns 0 if any leg has ratio <= 0', () => {
    const legs = [
      { burnPenaltyPctPerHr: 3.5, flightTimeHrs: 2 },
      { burnPenaltyPctPerHr: 100, flightTimeHrs: 2 }, // ratio = -1
    ];
    expect(compoundDeliveryRatio(legs)).toBe(0);
  });

  it('empty legs array yields 1.0', () => {
    expect(compoundDeliveryRatio([])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4.5 Effective Delivered Cost & 4.6 Break-Even Price
// ---------------------------------------------------------------------------
describe('effectiveDeliveredCost / breakEvenPrice', () => {
  it('break-even price = origin_price / delivery_ratio (no ramp fee)', () => {
    const originPrice = 5.0;
    const dr = 0.93;
    const effCost = effectiveDeliveredCost(originPrice, dr, 0, 100);
    expect(effCost).toBeCloseTo(originPrice / dr, 6);
    expect(breakEvenPrice(effCost)).toBeCloseTo(originPrice / dr, 6);
  });

  it('returns Infinity when delivery ratio is 0', () => {
    expect(effectiveDeliveredCost(5.0, 0, 0, 100)).toBe(Infinity);
  });

  it('includes ramp fee spread across purchased gallons', () => {
    const originPrice = 5.0;
    const dr = 0.95;
    const rampFee = 100;
    const totalGal = 200;
    const effCost = effectiveDeliveredCost(originPrice, dr, rampFee, totalGal);
    expect(effCost).toBeCloseTo(originPrice / dr + rampFee / totalGal, 6);
  });
});

// ---------------------------------------------------------------------------
// 4.7 Savings Per Gallon
// ---------------------------------------------------------------------------
describe('savingsPerGal', () => {
  it('savings = dest_price - (origin_price / delivery_ratio)', () => {
    const originPrice = 5.0;
    const destPrice = 7.0;
    const dr = 0.93;
    const effCost = effectiveDeliveredCost(originPrice, dr, 0, 100);
    const savings = savingsPerGal(destPrice, effCost);
    expect(savings).toBeCloseTo(destPrice - originPrice / dr, 6);
  });

  it('negative savings when dest is cheaper than delivered cost', () => {
    const effCost = effectiveDeliveredCost(6.0, 0.93, 0, 100);
    expect(savingsPerGal(5.0, effCost)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4.3 Burn Penalty Convergence
// ---------------------------------------------------------------------------
describe('burnPenalty', () => {
  it('converges within 3 iterations to within 0.1% of true value', () => {
    const extraFuel = 100; // gallons
    const penaltyPct = 2.5; // %/hr
    const time = 2; // hours

    // Analytical solution: penalty = extra * rate * time / (1 + rate * time)
    // where rate = 2.5/100 = 0.025
    const rate = penaltyPct / 100;
    const analyticalPenalty = extraFuel * rate * time / (1 + rate * time);

    const computedPenalty = burnPenalty(extraFuel, penaltyPct, time);

    // Should be within 0.1% of analytical value
    const pctError = Math.abs(computedPenalty - analyticalPenalty) / analyticalPenalty * 100;
    expect(pctError).toBeLessThan(0.1);
  });

  it('zero extra fuel => zero penalty', () => {
    expect(burnPenalty(0, 2.5, 2)).toBe(0);
  });

  it('zero penalty rate => zero penalty', () => {
    expect(burnPenalty(100, 0, 2)).toBe(0);
  });

  it('penalty is always less than extra fuel carried', () => {
    const penalty = burnPenalty(200, 5, 3);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// 4.1 Flight Time
// ---------------------------------------------------------------------------
describe('flightTime', () => {
  it('500 nm at 250 kts = 2 hours', () => {
    expect(flightTime(500, 250)).toBe(2);
  });

  it('throws on zero groundspeed', () => {
    expect(() => flightTime(500, 0)).toThrow();
  });

  it('throws on negative groundspeed', () => {
    expect(() => flightTime(500, -10)).toThrow();
  });

  it('zero distance = zero time', () => {
    expect(flightTime(0, 250)).toBe(0);
  });
});

describe('effectiveGroundspeed', () => {
  it('headwind reduces groundspeed', () => {
    expect(effectiveGroundspeed(400, 50)).toBe(350);
  });

  it('tailwind (negative headwind) increases groundspeed', () => {
    expect(effectiveGroundspeed(400, -50)).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// 4.2 Base Fuel Burn with corrections applied in order
// ---------------------------------------------------------------------------
describe('computeLegBurn', () => {
  const baseAircraft = {
    burnRateGph: 150,
    cruiseSpeedKts: 400,
    weightSensitivity: 0.25,
    oatCelsius: null as number | null,
    aircraft: { maxRampWeightLbs: 17230 } as any,
  } as any;

  it('basic burn = rate * (distance / speed)', () => {
    const { burnGal, flightTimeHrs } = computeLegBurn(400, baseAircraft, null);
    expect(flightTimeHrs).toBe(1); // 400 nm / 400 kts
    expect(burnGal).toBe(150); // 150 gph * 1 hr
  });

  it('headwind increases flight time and total burn', () => {
    const wind = { mode: 'headwind_tailwind' as const, headwindKts: 50 };
    const { burnGal, flightTimeHrs, groundspeedKts } = computeLegBurn(400, baseAircraft, wind);
    expect(groundspeedKts).toBe(350);
    expect(flightTimeHrs).toBeCloseTo(400 / 350, 6);
    expect(burnGal).toBeCloseTo(150 * (400 / 350), 4);
  });

  it('burn adjustment mode scales burn rate', () => {
    const wind = { mode: 'burn_adjustment' as const, burnAdjustmentPct: 10 };
    const { burnGal } = computeLegBurn(400, baseAircraft, wind);
    // 10% burn adjustment on 150 gph => 165 gph, 1 hr => 165 gal
    expect(burnGal).toBeCloseTo(165, 0);
  });
});

// ---------------------------------------------------------------------------
// Effective Delivered Cost formula end-to-end
// ---------------------------------------------------------------------------
describe('effective delivered cost formula', () => {
  it('matches manual calculation: origin $5.00, DR 0.93, no ramp fee', () => {
    const effCost = effectiveDeliveredCost(5.0, 0.93, 0, 100);
    // $5.00 / 0.93 = $5.376344...
    expect(effCost).toBeCloseTo(5.376344, 4);
  });

  it('with ramp fee $150 spread over 300 gal', () => {
    const effCost = effectiveDeliveredCost(5.0, 0.95, 150, 300);
    // $5.00/0.95 + $150/300 = $5.2632 + $0.50 = $5.7632
    expect(effCost).toBeCloseTo(5.7632, 3);
  });
});
