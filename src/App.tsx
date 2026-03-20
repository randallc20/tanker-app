import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  AppBar, Toolbar, Container, Button, Stack, Card, CardContent,
  Accordion, AccordionSummary, AccordionDetails, Alert, Box, Typography, TextField,
  InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {
  AircraftDefinition, Airport, Stop, ComputedLeg, AircraftConfig,
  WindInput, LegAnalysis, TripResult,
} from './lib/types';
import { aircraftDatabase } from './lib/aircraftDatabase';
import airportsData from './data/airports.json';
import { greatCircleDistanceNm } from './lib/distance';
import { computeLegBurn, analyzeLeg, deliveryRatio, effectiveDeliveredCost, savingsPerGal, compoundDeliveryRatio, carbonOffsetCost, DEFAULT_WEIGHT_SENSITIVITY, MARGINAL_THRESHOLD } from './lib/calculations';
import { computeTripResult, computeFobTimeline } from './lib/optimizer';
import { validateTrip } from './lib/validation';
import { fuelUnit, distanceUnit, weightUnit } from './lib/units';
import { useThemeMode } from './theme';

import AircraftPicker from './components/AircraftPicker';
import AircraftConfig_ from './components/AircraftConfig';
import type { AircraftConfigOverrides } from './components/AircraftConfig';
import RouteBuilder from './components/RouteBuilder';
import type { StopInput } from './components/RouteBuilder';
import LegDetails from './components/LegDetails';
import SummaryBar from './components/SummaryBar';
import TankeringTable from './components/TankeringTable';
import ScenarioComparison from './components/ScenarioComparison';
import StopRecommendationCard from './components/StopRecommendationCard';
import AdvancedFactors from './components/AdvancedFactors';

// Cast airports JSON
const airports: Airport[] = airportsData as Airport[];

// Find airport by ICAO
function findAirport(icao: string): Airport | null {
  return airports.find(a => a.icao === icao) ?? null;
}

// Default CJ4 aircraft
const defaultAircraft = aircraftDatabase.find(
  a => a.make === 'Cessna' && a.model === 'Citation CJ4'
) ?? aircraftDatabase[0];

// Pre-loaded example stops
function makeDefaultStops(): StopInput[] {
  const kjfk = findAirport('KJFK');
  const kmia = findAirport('KMIA');
  const kdfw = findAirport('KDFW');
  const kden = findAirport('KDEN');

  const stops: StopInput[] = [
    { icao: 'KJFK', fuelPrice: 5.25, rampFee: 350, minWaiverGal: 150, distanceToNext: null, distanceOverride: false, airport: kjfk },
    { icao: 'KMIA', fuelPrice: 7.10, rampFee: 0, minWaiverGal: 0, distanceToNext: null, distanceOverride: false, airport: kmia },
    { icao: 'KDFW', fuelPrice: 5.40, rampFee: 275, minWaiverGal: 100, distanceToNext: null, distanceOverride: false, airport: kdfw },
    { icao: 'KDEN', fuelPrice: 4.85, rampFee: 0, minWaiverGal: 0, distanceToNext: null, distanceOverride: false, airport: kden },
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (stops[i].airport && stops[i + 1].airport) {
      stops[i].distanceToNext = Math.round(
        greatCircleDistanceNm(
          stops[i].airport!.lat, stops[i].airport!.lon,
          stops[i + 1].airport!.lat, stops[i + 1].airport!.lon,
        )
      );
    }
  }

  return stops;
}

export default function App() {
  const { mode, toggle } = useThemeMode();

  // === State ===
  const [metric, setMetric] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftDefinition>(defaultAircraft);
  const [configOverrides, setConfigOverrides] = useState<Partial<AircraftConfigOverrides>>({});
  const [stops, setStops] = useState<StopInput[]>(makeDefaultStops);
  const [initFuelGal, setInitFuelGal] = useState(400);
  const [showTier2, setShowTier2] = useState(false);

  // Advanced state
  const [winds, setWinds] = useState<(WindInput | null)[]>([]);
  const [oatCelsius, setOatCelsius] = useState<number | null>(null);
  const [rampWeightLbs, setRampWeightLbs] = useState(0);
  const [weightSensitivity, setWeightSensitivity] = useState(DEFAULT_WEIGHT_SENSITIVITY);
  const [carbonOffsetPerTonne, setCarbonOffsetPerTonne] = useState(0);

  // Ensure winds array matches leg count
  const legCount = Math.max(0, stops.length - 1);
  useEffect(() => {
    if (winds.length !== legCount) {
      setWinds(prev => {
        const next = [...prev];
        while (next.length < legCount) next.push(null);
        return next.slice(0, legCount);
      });
    }
  }, [legCount, winds.length]);

  // === Derived: Aircraft Config ===
  const aircraftConfig: AircraftConfig = useMemo(() => ({
    aircraft: selectedAircraft,
    initFuelGal,
    reserveFuelGal: configOverrides.reserveFuelGal ?? selectedAircraft.reservesTypicalGal,
    burnRateGph: configOverrides.burnRateGph ?? selectedAircraft.typicalBurnGph,
    burnPenaltyPctPerHr: configOverrides.burnPenaltyPctPerHr ?? selectedAircraft.burnPenaltyPerHrPct,
    cruiseSpeedKts: configOverrides.cruiseSpeedKts ?? selectedAircraft.cruiseSpeedKts,
    maxFuelGal: configOverrides.maxFuelGal ?? selectedAircraft.maxFuelGal,
    rampWeightLbs,
    weightSensitivity,
    oatCelsius,
    carbonOffsetPerTonne,
  }), [selectedAircraft, configOverrides, initFuelGal, rampWeightLbs, weightSensitivity, oatCelsius, carbonOffsetPerTonne]);

  // === Derived: Stops → Stop[] for optimizer ===
  const optimizerStops: Stop[] = useMemo(() =>
    stops.map(s => ({
      icao: s.icao,
      fuelPricePerGal: s.fuelPrice,
      rampFee: s.rampFee,
      minWaiverGal: s.minWaiverGal,
      availableGal: 0,
      isFuelOnlyStop: false,
      extraGroundTimeMin: 30,
      crewCostPerHr: 0,
    }))
  , [stops]);

  // === Derived: Computed Legs ===
  const computedLegs: ComputedLeg[] = useMemo(() => {
    const legs: ComputedLeg[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const dist = stops[i].distanceToNext ?? 0;
      if (dist <= 0) {
        legs.push({
          fromIndex: i, toIndex: i + 1, distanceNm: 0, flightTimeHrs: 0,
          baseBurnGal: 0, actualBurnGal: 0, windAdjustmentPct: 0, headwindKts: 0,
          effectiveGroundspeedKts: aircraftConfig.cruiseSpeedKts,
        });
        continue;
      }
      try {
        const wind = winds[i] ?? null;
        const result = computeLegBurn(dist, aircraftConfig, wind, rampWeightLbs > 0 ? rampWeightLbs : undefined);
        const headwindKts = wind?.headwindKts ?? 0;
        legs.push({
          fromIndex: i, toIndex: i + 1, distanceNm: dist,
          flightTimeHrs: result.flightTimeHrs, baseBurnGal: result.burnGal,
          actualBurnGal: result.burnGal, windAdjustmentPct: wind?.burnAdjustmentPct ?? 0,
          headwindKts, effectiveGroundspeedKts: result.groundspeedKts,
        });
      } catch {
        legs.push({
          fromIndex: i, toIndex: i + 1, distanceNm: dist, flightTimeHrs: 0,
          baseBurnGal: 0, actualBurnGal: 0, windAdjustmentPct: 0, headwindKts: 0,
          effectiveGroundspeedKts: aircraftConfig.cruiseSpeedKts,
        });
      }
    }
    return legs;
  }, [stops, aircraftConfig, winds, rampWeightLbs]);

  // === Derived: Validation ===
  const validation = useMemo(
    () => validateTrip(optimizerStops, computedLegs, aircraftConfig),
    [optimizerStops, computedLegs, aircraftConfig]
  );

  const hasErrors = validation.errors.length > 0;
  const canCompute = !hasErrors && stops.length >= 2 && computedLegs.some(l => l.distanceNm > 0);

  // === Derived: Trip Result ===
  const tripResult: TripResult | null = useMemo(() => {
    if (!canCompute) return null;
    try {
      const result = computeTripResult(optimizerStops, computedLegs, aircraftConfig);
      result.warnings = validation.warnings;
      result.errors = validation.errors;
      return result;
    } catch {
      return null;
    }
  }, [canCompute, optimizerStops, computedLegs, aircraftConfig, validation]);

  // === Derived: Leg Analyses ===
  const legAnalyses: LegAnalysis[] = useMemo(() => {
    if (!tripResult) return [];
    return computedLegs.map((leg, i) =>
      analyzeLeg(optimizerStops[i], optimizerStops[i + 1], leg, aircraftConfig, tripResult.optimizedPlan[i]?.upliftGal ?? 0)
    );
  }, [tripResult, computedLegs, optimizerStops, aircraftConfig]);

  // === Derived: Multi-leg analyses ===
  const multiLegAnalyses: LegAnalysis[] = useMemo(() => {
    if (!tripResult || stops.length < 3) return [];
    const analyses: LegAnalysis[] = [];
    for (let i = 0; i < stops.length - 2; i++) {
      for (let j = i + 2; j < stops.length; j++) {
        const legSlice = computedLegs.slice(i, j).map(l => ({
          burnPenaltyPctPerHr: aircraftConfig.burnPenaltyPctPerHr,
          flightTimeHrs: l.flightTimeHrs,
        }));
        const ratio = compoundDeliveryRatio(legSlice);
        if (ratio <= 0) continue;
        const totalGal = tripResult.optimizedPlan[i]?.upliftGal ?? 0;
        const rampFee = optimizerStops[i].rampFee > 0 && totalGal < optimizerStops[i].minWaiverGal
          ? optimizerStops[i].rampFee : 0;
        const effCost = effectiveDeliveredCost(optimizerStops[i].fuelPricePerGal, ratio, rampFee, totalGal);
        const savings = savingsPerGal(optimizerStops[j].fuelPricePerGal, effCost);
        let verdict: LegAnalysis['verdict'];
        if (savings > MARGINAL_THRESHOLD) verdict = 'tanker';
        else if (savings < -MARGINAL_THRESHOLD) verdict = 'dont_tanker';
        else verdict = 'marginal';
        if (savings > -0.50) {
          analyses.push({
            legIndex: i, fromIcao: optimizerStops[i].icao, toIcao: optimizerStops[j].icao,
            distanceNm: computedLegs.slice(i, j).reduce((s, l) => s + l.distanceNm, 0),
            flightTimeHrs: computedLegs.slice(i, j).reduce((s, l) => s + l.flightTimeHrs, 0),
            actualBurnGal: computedLegs.slice(i, j).reduce((s, l) => s + l.actualBurnGal, 0),
            originPrice: optimizerStops[i].fuelPricePerGal,
            destPrice: optimizerStops[j].fuelPricePerGal,
            deliveryRatio: ratio, breakEvenPrice: effCost,
            effectiveDeliveredCost: effCost, savingsPerGal: savings, verdict,
          });
        }
      }
    }
    return analyses;
  }, [tripResult, stops, computedLegs, optimizerStops, aircraftConfig]);

  const legLabels = computedLegs.map((l, i) =>
    `${stops[i]?.icao || '?'} → ${stops[i + 1]?.icao || '?'}`
  );

  const handleAircraftSelect = useCallback((ac: AircraftDefinition) => {
    setSelectedAircraft(ac);
    setConfigOverrides({});
  }, []);

  const advStops = stops.map(s => ({
    icao: s.icao, isFuelOnlyStop: false, extraGroundTimeMin: 30, crewCostPerHr: 0,
  }));

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Header */}
      <AppBar position="sticky" elevation={1} sx={{ bgcolor: 'background.paper', color: 'text.primary' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" fontWeight="bold">Fuel Tankering Calculator</Typography>
              <Typography variant="caption" color="text.secondary">
                Optimize fuel purchases across multi-leg trips
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={() => setMetric(m => !m)}>
                {metric ? 'Metric (L / km / kg)' : 'US (gal / nm / lbs)'}
              </Button>
              <Button variant="outlined" size="small" onClick={toggle}>
                {mode === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={3}>
          {/* Aircraft Selection */}
          <Card variant="outlined">
            <CardContent>
              <AircraftPicker
                aircraft={aircraftDatabase}
                selected={selectedAircraft}
                onSelect={handleAircraftSelect}
              />
              <AircraftConfig_
                aircraft={selectedAircraft}
                overrides={configOverrides}
                onOverride={setConfigOverrides}
                metric={metric}
              />
            </CardContent>
          </Card>

          {/* Route & Fuel */}
          <Card variant="outlined">
            <CardContent>
              <RouteBuilder
                stops={stops}
                onStopsChange={setStops}
                airports={airports}
                metric={metric}
                showRampFees={showTier2}
              />
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" noWrap>
                  Current fuel on board:
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  value={initFuelGal}
                  onChange={e => setInitFuelGal(parseFloat(e.target.value) || 0)}
                  slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right', fontFamily: 'monospace' } } }}
                  sx={{ width: 130 }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">{fuelUnit(metric)}</InputAdornment>,
                  }}
                />
              </Stack>
            </CardContent>
          </Card>

          {/* Tier 2 — Fuel & Reserve Settings */}
          <Accordion
            expanded={showTier2}
            onChange={() => setShowTier2(!showTier2)}
            variant="outlined"
            disableGutters
            sx={{ borderRadius: '12px !important', '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Fuel & reserve settings
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                Many FBOs waive the ramp/handling fee if you purchase a minimum number of gallons.
                Enter both fields and the optimizer will factor this into the tankering decision —
                sometimes buying a few extra gallons to hit the threshold saves hundreds of dollars.
              </Alert>
            </AccordionDetails>
          </Accordion>

          {/* Tier 3 — Advanced Factors */}
          <Card variant="outlined">
            <CardContent>
              <AdvancedFactors
                winds={winds}
                onWindsChange={setWinds}
                legCount={legCount}
                legLabels={legLabels}
                oatCelsius={oatCelsius}
                onOatChange={setOatCelsius}
                rampWeightLbs={rampWeightLbs}
                onRampWeightChange={setRampWeightLbs}
                maxRampWeightLbs={selectedAircraft.maxRampWeightLbs}
                weightSensitivity={weightSensitivity}
                onWeightSensitivityChange={setWeightSensitivity}
                stops={advStops}
                onStopUpdate={() => {}}
                carbonOffsetPerTonne={carbonOffsetPerTonne}
                onCarbonOffsetChange={setCarbonOffsetPerTonne}
              />
            </CardContent>
          </Card>

          {/* Leg Details */}
          {computedLegs.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <LegDetails legs={computedLegs} stopIcaos={stops.map(s => s.icao)} metric={metric} />
              </CardContent>
            </Card>
          )}

          {/* Validation Messages */}
          {validation.errors.length > 0 && (
            <Alert severity="error">
              {validation.errors.map((err, i) => (
                <Typography key={i} variant="body2">{err.message}</Typography>
              ))}
            </Alert>
          )}

          {validation.warnings.length > 0 && (
            <Alert severity="warning">
              {validation.warnings.map((warn, i) => (
                <Typography key={i} variant="body2">{warn.message}</Typography>
              ))}
            </Alert>
          )}

          {/* Results Section */}
          {tripResult && (
            <>
              <SummaryBar
                totalCostOptimized={tripResult.totalCostOptimized}
                totalCostMinimum={tripResult.totalCostMinimum}
                savings={tripResult.savings}
                savingsPct={tripResult.savingsPct}
                totalFuelUplifted={tripResult.totalFuelUplifted}
                avgEffectiveCost={tripResult.avgEffectiveCost}
                metric={metric}
              />

              <Card variant="outlined">
                <CardContent>
                  <TankeringTable
                    legAnalyses={legAnalyses}
                    multiLegAnalyses={multiLegAnalyses}
                    metric={metric}
                  />
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <ScenarioComparison
                    stops={optimizerStops}
                    legs={computedLegs}
                    aircraft={aircraftConfig}
                    minimumPlan={tripResult.minimumPlan}
                    optimizedPlan={tripResult.optimizedPlan}
                    metric={metric}
                  />
                </CardContent>
              </Card>

              {/* Per-Stop Recommendations */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Stop Recommendations
                </Typography>
                <Grid container spacing={2}>
                  {tripResult.optimizedPlan.map((plan, i) => (
                    <Grid size={{ xs: 12, md: 6 }} key={i}>
                      <StopRecommendationCard
                        plan={plan}
                        stop={optimizerStops[i]}
                        airportName={stops[i].airport?.name ?? stops[i].icao}
                        metric={metric}
                        maxFuelGal={aircraftConfig.maxFuelGal}
                        reserveFuelGal={aircraftConfig.reserveFuelGal}
                        windNote={
                          winds[i]?.headwindKts
                            ? `Adjusted for ${Math.abs(winds[i]!.headwindKts!)} kt ${winds[i]!.headwindKts! > 0 ? 'headwind' : 'tailwind'} on this leg`
                            : undefined
                        }
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Carbon offset summary */}
              {carbonOffsetPerTonne > 0 && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Total trip carbon offset cost:{' '}
                      <Typography component="span" variant="body2" fontWeight="medium">
                        ${carbonOffsetCost(
                          computedLegs.reduce((s, l) => s + l.actualBurnGal, 0),
                          carbonOffsetPerTonne
                        ).toFixed(2)}
                      </Typography>
                      {' '}({(computedLegs.reduce((s, l) => s + l.actualBurnGal, 0) * 9.57 / 1000).toFixed(1)} tonnes CO₂)
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Stack>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ mt: 6, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg" sx={{ py: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            This calculator provides fuel cost planning estimates only. All performance data is sourced
            from publicly available documents and may not reflect your specific aircraft's actual performance.
            Never use this tool as a substitute for your FAA-approved Airplane Flight Manual, official
            weight and balance documentation, or dispatch release. The pilots in command are solely
            responsible for all fuel planning decisions.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
