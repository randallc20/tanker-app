import { describe, it, expect } from 'vitest';
import { optimizeTrip, minimumFuelPlan, computeFobTimeline } from '../optimizer';
import type { Stop, ComputedLeg, AircraftConfig, AircraftDefinition } from '../types';

// ---------------------------------------------------------------------------
// Helpers to build test fixtures
// ---------------------------------------------------------------------------
function makeAircraftDef(overrides: Partial<AircraftDefinition> = {}): AircraftDefinition {
  return {
    make: 'Test',
    model: 'Test',
    variant: 'T1',
    yearStart: 2020,
    yearEnd: null,
    fuelType: 'JetA',
    engines: '2x test',
    maxFuelGal: 870,
    cruiseSpeedKts: 400,
    typicalBurnGph: 150,
    burnRangeGph: [120, 180],
    maxRampWeightLbs: 17230,
    maxZeroFuelWeightLbs: 12500,
    basicOperatingWeightLbs: 10350,
    maxPayloadLbs: 1052,
    reservesTypicalGal: 147,
    reservesNbaaGal: 136,
    burnPenaltyPerHrPct: 2.5,
    confidence: {
      weights: 'manufacturer_spec',
      fuelCapacity: 'manufacturer_spec',
      burnRate: 'manufacturer_spec',
      burnPenalty: 'manufacturer_spec',
      reserves: 'manufacturer_spec',
    },
    dataSource: 'Test data',
    dataSourceDate: '2024',
    operatorNotes: '',
    ...overrides,
  } as AircraftDefinition;
}

function makeAircraft(overrides: Partial<AircraftConfig> = {}): AircraftConfig {
  return {
    aircraft: makeAircraftDef(),
    initFuelGal: 200,
    reserveFuelGal: 136,
    burnRateGph: 150,
    burnPenaltyPctPerHr: 2.5,
    cruiseSpeedKts: 400,
    maxFuelGal: 870,
    rampWeightLbs: 15000,
    weightSensitivity: 0.25,
    oatCelsius: null,
    carbonOffsetPerTonne: 0,
    ...overrides,
  };
}

function makeStop(icao: string, price: number, overrides: Partial<Stop> = {}): Stop {
  return {
    icao,
    fuelPricePerGal: price,
    rampFee: 0,
    minWaiverGal: 0,
    availableGal: 0,
    isFuelOnlyStop: false,
    extraGroundTimeMin: 0,
    crewCostPerHr: 0,
    ...overrides,
  };
}

function makeLeg(fromIdx: number, toIdx: number, distanceNm: number, burnGal: number, timeHrs: number): ComputedLeg {
  return {
    fromIndex: fromIdx,
    toIndex: toIdx,
    distanceNm,
    flightTimeHrs: timeHrs,
    baseBurnGal: burnGal,
    actualBurnGal: burnGal,
    windAdjustmentPct: 0,
    headwindKts: 0,
    effectiveGroundspeedKts: 400,
  };
}

// ---------------------------------------------------------------------------
// Core constraint tests
// ---------------------------------------------------------------------------
describe('optimizer constraints', () => {
  it('never produces FOB > maxFuelGal at any waypoint', () => {
    const aircraft = makeAircraft({ initFuelGal: 100, maxFuelGal: 870 });
    const stops = [
      makeStop('KABC', 4.00),
      makeStop('KDEF', 8.00),
      makeStop('KGHI', 8.00),
    ];
    const legs = [
      makeLeg(0, 1, 400, 150, 1),
      makeLeg(1, 2, 400, 150, 1),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    for (const plan of plans) {
      expect(plan.fobAfterUplift).toBeLessThanOrEqual(aircraft.maxFuelGal);
    }
  });

  it('never produces FOB < reserveFuelGal after any leg', () => {
    const aircraft = makeAircraft({ initFuelGal: 100, reserveFuelGal: 136 });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
      makeStop('KGHI', 7.00),
    ];
    const legs = [
      makeLeg(0, 1, 400, 200, 1),
      makeLeg(1, 2, 400, 200, 1),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    const fobs = computeFobTimeline(plans, legs, aircraft);

    // FOB timeline tracks FOB after uplift at each stop.
    // After flying each leg, fob decreases by burn+penalty.
    // The optimizer ensures enough fuel is bought that reserves are met.
    // Verify by simulating forward.
    let fob = aircraft.initFuelGal;
    for (let i = 0; i < plans.length; i++) {
      fob += plans[i].upliftGal;
      if (i < legs.length) {
        fob -= legs[i].actualBurnGal + plans[i].penaltyBurnGal;
        expect(fob).toBeGreaterThanOrEqual(aircraft.reserveFuelGal - 0.01); // small float tolerance
      }
    }
  });

  it('never exceeds FBO availability limit', () => {
    const aircraft = makeAircraft({ initFuelGal: 100 });
    const stops = [
      makeStop('KABC', 3.00, { availableGal: 250 }),
      makeStop('KDEF', 8.00),
      makeStop('KGHI', 8.00),
    ];
    const legs = [
      makeLeg(0, 1, 400, 150, 1),
      makeLeg(1, 2, 400, 150, 1),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    // Uplift at stop 0 should not exceed 250 gal
    expect(plans[0].upliftGal).toBeLessThanOrEqual(250);
  });
});

// ---------------------------------------------------------------------------
// Economic behavior tests
// ---------------------------------------------------------------------------
describe('optimizer economic behavior', () => {
  it('recommends buying more at cheap airports than expensive ones', () => {
    const aircraft = makeAircraft({ initFuelGal: 100 });
    const stops = [
      makeStop('CHEAP', 3.00),
      makeStop('EXPENSIVE', 8.00),
      makeStop('DEST', 6.00),
    ];
    const legs = [
      makeLeg(0, 1, 300, 120, 0.75),
      makeLeg(1, 2, 300, 120, 0.75),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    // More fuel bought at cheap stop than expensive stop
    expect(plans[0].upliftGal).toBeGreaterThan(plans[1].upliftGal);
  });

  it('handles 2-stop trip (1 leg) correctly', () => {
    const aircraft = makeAircraft({ initFuelGal: 200 });
    const stops = [
      makeStop('ORIG', 5.00),
      makeStop('DEST', 7.00),
    ];
    const legs = [
      makeLeg(0, 1, 500, 200, 1.25),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    expect(plans).toHaveLength(2);
    // Must buy enough at origin to complete the leg with reserves
    const mustBuy = Math.max(0, 200 + 136 - 200); // burn + reserve - initFuel
    expect(plans[0].upliftGal).toBeGreaterThanOrEqual(mustBuy);
  });

  it('handles all-same-prices correctly (no extra tankering)', () => {
    const aircraft = makeAircraft({ initFuelGal: 200 });
    const stops = [
      makeStop('KABC', 6.00),
      makeStop('KDEF', 6.00),
      makeStop('KGHI', 6.00),
    ];
    const legs = [
      makeLeg(0, 1, 300, 120, 0.75),
      makeLeg(1, 2, 300, 120, 0.75),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    // With same prices, tankering incurs penalty cost with no benefit,
    // so extra buy should be 0 or minimal at each stop
    for (const plan of plans) {
      expect(plan.extraBuyGal).toBe(0);
    }
  });

  it('handles cheapest price at last stop (no benefit to tanker)', () => {
    const aircraft = makeAircraft({ initFuelGal: 200 });
    const stops = [
      makeStop('KABC', 7.00),
      makeStop('KDEF', 6.00),
      makeStop('KGHI', 4.00), // cheapest at destination
    ];
    const legs = [
      makeLeg(0, 1, 300, 120, 0.75),
      makeLeg(1, 2, 300, 120, 0.75),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    // No extra tankering at earlier stops since dest is cheapest
    expect(plans[0].extraBuyGal).toBe(0);
    expect(plans[1].extraBuyGal).toBe(0);
  });

  it('handles aircraft starting nearly full', () => {
    const aircraft = makeAircraft({ initFuelGal: 850, maxFuelGal: 870 });
    const stops = [
      makeStop('KABC', 3.00),
      makeStop('KDEF', 8.00),
    ];
    const legs = [
      makeLeg(0, 1, 300, 120, 0.75),
    ];

    const plans = optimizeTrip(stops, legs, aircraft);
    // Can only buy up to 20 gal (870 - 850)
    expect(plans[0].upliftGal).toBeLessThanOrEqual(20);
    // FOB after uplift must not exceed max
    expect(plans[0].fobAfterUplift).toBeLessThanOrEqual(870);
  });
});

// ---------------------------------------------------------------------------
// Minimum fuel plan
// ---------------------------------------------------------------------------
describe('minimumFuelPlan', () => {
  it('buys only what is needed at each stop', () => {
    const aircraft = makeAircraft({ initFuelGal: 200, reserveFuelGal: 136 });
    const stops = [
      makeStop('KABC', 3.00),
      makeStop('KDEF', 8.00),
      makeStop('KGHI', 6.00),
    ];
    const legs = [
      makeLeg(0, 1, 400, 200, 1),
      makeLeg(1, 2, 400, 200, 1),
    ];

    const plans = minimumFuelPlan(stops, legs, aircraft);

    // At stop 0: need 200 (burn) + 136 (reserve) = 336, have 200, must buy 136
    expect(plans[0].mustBuyGal).toBeCloseTo(136, 0);
    expect(plans[0].extraBuyGal).toBe(0);

    // After leg 0: 200 + 136 - 200 = 136 gal
    // At stop 1: need 200 + 136 = 336, have 136, must buy 200
    expect(plans[1].mustBuyGal).toBeCloseTo(200, 0);
    expect(plans[1].extraBuyGal).toBe(0);
  });

  it('buys nothing when starting with enough fuel', () => {
    const aircraft = makeAircraft({ initFuelGal: 500, reserveFuelGal: 136 });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
    ];
    const legs = [
      makeLeg(0, 1, 300, 120, 0.75),
    ];

    const plans = minimumFuelPlan(stops, legs, aircraft);
    // Have 500, need 120 + 136 = 256 => no buy needed
    expect(plans[0].mustBuyGal).toBe(0);
    expect(plans[0].upliftGal).toBe(0);
  });
});
