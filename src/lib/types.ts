export type DataConfidenceTier = 'verified' | 'manufacturer_spec' | 'community_estimate';

export interface AircraftDefinition {
  make: string;
  model: string;
  variant: string;
  yearStart: number;
  yearEnd: number | null;
  fuelType: 'JetA' | 'AvGas';
  engines: string;
  maxFuelGal: number;
  tabsOnlyGal?: number;
  cruiseSpeedKts: number;
  typicalBurnGph: number;
  burnRangeGph: [number, number];
  maxRampWeightLbs: number;
  maxZeroFuelWeightLbs: number;
  basicOperatingWeightLbs: number;
  maxPayloadLbs: number;
  reservesTypicalGal: number;
  reservesNbaaGal: number;
  burnPenaltyPerHrPct: number;
  confidence: {
    weights: DataConfidenceTier;
    fuelCapacity: DataConfidenceTier;
    burnRate: DataConfidenceTier;
    burnPenalty: DataConfidenceTier;
    reserves: DataConfidenceTier;
  };
  dataSource: string;
  dataSourceDate: string;
  operatorNotes: string;
}

export interface Airport {
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface Stop {
  icao: string;
  fuelPricePerGal: number;
  rampFee: number;
  minWaiverGal: number;
  availableGal: number; // 0 = unlimited
  isFuelOnlyStop: boolean;
  extraGroundTimeMin: number;
  crewCostPerHr: number;
}

export interface ComputedLeg {
  fromIndex: number;
  toIndex: number;
  distanceNm: number;
  flightTimeHrs: number;
  baseBurnGal: number;
  actualBurnGal: number; // after all corrections
  windAdjustmentPct: number;
  headwindKts: number;
  effectiveGroundspeedKts: number;
}

export interface AircraftConfig {
  aircraft: AircraftDefinition;
  initFuelGal: number;
  reserveFuelGal: number;
  burnRateGph: number; // possibly overridden by pilot
  burnPenaltyPctPerHr: number;
  cruiseSpeedKts: number;
  maxFuelGal: number;
  // Advanced
  rampWeightLbs: number;
  weightSensitivity: number;
  oatCelsius: number | null;
  carbonOffsetPerTonne: number;
}

export interface UpliftPlan {
  stopIndex: number;
  upliftGal: number;
  mustBuyGal: number;
  extraBuyGal: number;
  cost: number;
  rampFeePaid: number;
  rampFeeWaived: boolean;
  penaltyBurnGal: number;
  fobAfterUplift: number;
  reason: string;
  rampFeeNote: string;
}

export interface TripResult {
  optimizedPlan: UpliftPlan[];
  minimumPlan: UpliftPlan[];
  totalCostOptimized: number;
  totalCostMinimum: number;
  savings: number;
  savingsPct: number;
  totalFuelUplifted: number;
  avgEffectiveCost: number;
  legs: ComputedLeg[];
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
}

export interface LegAnalysis {
  legIndex: number;
  fromIcao: string;
  toIcao: string;
  distanceNm: number;
  flightTimeHrs: number;
  actualBurnGal: number;
  originPrice: number;
  destPrice: number;
  deliveryRatio: number;
  breakEvenPrice: number;
  effectiveDeliveredCost: number;
  savingsPerGal: number;
  verdict: 'tanker' | 'dont_tanker' | 'marginal' | 'ramp_fee_changes';
}

export interface ValidationMessage {
  type: 'error' | 'warning';
  field?: string;
  legIndex?: number;
  stopIndex?: number;
  message: string;
}

export interface WindInput {
  mode: 'burn_adjustment' | 'headwind_tailwind' | 'live_forecast';
  burnAdjustmentPct?: number;
  headwindKts?: number;
  forecastAltitudeFl?: number;
}

export interface RampFeeWaiverResult {
  recommendedUplift: number;
  rampFeePaid: number;
  rampFeeWaived: boolean;
  note: string;
}

export interface ScenarioStop {
  icao: string;
  airportName: string;
  fuelPrice: number;
  upliftGal: number;
  cost: number;
  fobAfter: number;
  rampFee: number;
  rampFeeWaived: boolean;
}

export interface Scenario {
  name: string;
  stops: ScenarioStop[];
  totalCost: number;
  fobAtEachPoint: number[]; // FOB at each waypoint for charting
}
