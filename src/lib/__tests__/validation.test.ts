import { describe, it, expect } from 'vitest';
import { validateTrip } from '../validation';
import type { Stop, ComputedLeg, AircraftConfig, AircraftDefinition } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAircraftDef(): AircraftDefinition {
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

function makeLeg(fromIdx: number, toIdx: number, burnGal: number, timeHrs: number): ComputedLeg {
  return {
    fromIndex: fromIdx,
    toIndex: toIdx,
    distanceNm: 400,
    flightTimeHrs: timeHrs,
    baseBurnGal: burnGal,
    actualBurnGal: burnGal,
    windAdjustmentPct: 0,
    headwindKts: 0,
    effectiveGroundspeedKts: 400,
  };
}

// ---------------------------------------------------------------------------
// Hard errors
// ---------------------------------------------------------------------------
describe('validation hard errors', () => {
  it('error when burn + reserve > maxFuel', () => {
    const aircraft = makeAircraft({ maxFuelGal: 870, reserveFuelGal: 136 });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
    ];
    // Burn 800 gal + 136 reserve = 936 > 870 maxFuel
    const legs = [makeLeg(0, 1, 800, 2)];

    const { errors } = validateTrip(stops, legs, aircraft);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.type === 'error' && e.message.includes('infeasible'))).toBe(true);
  });

  it('no error when burn + reserve <= maxFuel', () => {
    const aircraft = makeAircraft({ maxFuelGal: 870, reserveFuelGal: 136 });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
    ];
    // Burn 700 + 136 = 836 <= 870
    const legs = [makeLeg(0, 1, 700, 1.75)];

    const { errors } = validateTrip(stops, legs, aircraft);
    const infeasibleErrors = errors.filter(e => e.message.includes('infeasible'));
    expect(infeasibleErrors).toHaveLength(0);
  });

  it('error when delivery ratio goes to zero or negative (FOB effectively goes negative)', () => {
    // A very long leg where burn penalty rate * time >= 100%
    const aircraft = makeAircraft({ burnPenaltyPctPerHr: 10, maxFuelGal: 5000, reserveFuelGal: 50 });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
    ];
    // 10%/hr * 10 hrs = 100% => delivery ratio = 0
    const legs = [makeLeg(0, 1, 200, 10)];

    const { errors } = validateTrip(stops, legs, aircraft);
    expect(errors.some(e => e.message.includes('zero or negative'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Soft warnings
// ---------------------------------------------------------------------------
describe('validation soft warnings', () => {
  it('warning when delivery ratio < 85%', () => {
    // 2.5%/hr * 7 hrs = 17.5% loss => ratio = 82.5% < 85%
    const aircraft = makeAircraft({
      burnPenaltyPctPerHr: 2.5,
      maxFuelGal: 2000,
      reserveFuelGal: 100,
    });
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 7.00),
    ];
    const legs = [makeLeg(0, 1, 500, 7)]; // 7-hour leg

    const { warnings } = validateTrip(stops, legs, aircraft);
    expect(warnings.some(w => w.message.includes('efficiency'))).toBe(true);
  });

  it('warning when all prices within $0.10', () => {
    const aircraft = makeAircraft();
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 5.05),
      makeStop('KGHI', 5.09),
    ];
    const legs = [
      makeLeg(0, 1, 150, 1),
      makeLeg(1, 2, 150, 1),
    ];

    const { warnings } = validateTrip(stops, legs, aircraft);
    expect(warnings.some(w => w.message.toLowerCase().includes('similar'))).toBe(true);
  });

  it('no similar-price warning when spread is > $0.10', () => {
    const aircraft = makeAircraft();
    const stops = [
      makeStop('KABC', 5.00),
      makeStop('KDEF', 5.50),
      makeStop('KGHI', 6.00),
    ];
    const legs = [
      makeLeg(0, 1, 150, 1),
      makeLeg(1, 2, 150, 1),
    ];

    const { warnings } = validateTrip(stops, legs, aircraft);
    expect(warnings.some(w => w.message.toLowerCase().includes('similar'))).toBe(false);
  });

  it('warning when cheapest at last stop', () => {
    const aircraft = makeAircraft();
    const stops = [
      makeStop('KABC', 7.00),
      makeStop('KDEF', 6.00),
      makeStop('KGHI', 4.00), // cheapest is last
    ];
    const legs = [
      makeLeg(0, 1, 150, 1),
      makeLeg(1, 2, 150, 1),
    ];

    const { warnings } = validateTrip(stops, legs, aircraft);
    expect(warnings.some(w => w.message.toLowerCase().includes('final destination'))).toBe(true);
  });

  it('no cheapest-at-last warning when last stop is NOT cheapest', () => {
    const aircraft = makeAircraft();
    const stops = [
      makeStop('KABC', 4.00), // cheapest is first
      makeStop('KDEF', 6.00),
      makeStop('KGHI', 7.00),
    ];
    const legs = [
      makeLeg(0, 1, 150, 1),
      makeLeg(1, 2, 150, 1),
    ];

    const { warnings } = validateTrip(stops, legs, aircraft);
    expect(warnings.some(w => w.message.toLowerCase().includes('final destination'))).toBe(false);
  });
});
