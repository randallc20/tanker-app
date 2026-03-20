import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Card, CardContent, Stack, Alert, InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import type { UpliftPlan, Stop, ComputedLeg, AircraftConfig } from '../lib/types';
import { formatDollars, formatFuel, formatSavings } from '../lib/formatters';
import { fuelUnit } from '../lib/units';
import { validateManualPlan, computeFobTimeline } from '../lib/optimizer';
import FOBChart from './FOBChart';

interface ScenarioComparisonProps {
  stops: Stop[];
  legs: ComputedLeg[];
  aircraft: AircraftConfig;
  minimumPlan: UpliftPlan[];
  optimizedPlan: UpliftPlan[];
  metric: boolean;
}

export default function ScenarioComparison({
  stops, legs, aircraft, minimumPlan, optimizedPlan, metric,
}: ScenarioComparisonProps) {
  const fu = fuelUnit(metric);

  const [manualUpliftsRaw, setManualUplifts] = useState<number[]>(
    () => optimizedPlan.map(p => p.upliftGal)
  );

  // Keep manualUplifts in sync when stops change
  useEffect(() => {
    setManualUplifts(optimizedPlan.map(p => p.upliftGal));
  }, [optimizedPlan.length]);

  // Clamp to current stop count to survive the render before useEffect fires
  const manualUplifts = manualUpliftsRaw.slice(0, stops.length);

  const manualViolations = validateManualPlan(manualUplifts, stops, legs, aircraft);

  const manualCosts = manualUplifts.map((uplift, i) => {
    const stop = stops[i];
    const rampFee = stop.rampFee > 0 && uplift < stop.minWaiverGal ? stop.rampFee : 0;
    return uplift * stop.fuelPricePerGal + rampFee;
  });
  const manualTotal = manualCosts.reduce((s, c) => s + c, 0);
  const minTotal = minimumPlan.reduce((s, p) => s + p.cost, 0);
  const optTotal = optimizedPlan.reduce((s, p) => s + p.cost, 0);

  const minFobs = computeFobTimeline(minimumPlan, legs, aircraft);
  const optFobs = computeFobTimeline(optimizedPlan, legs, aircraft);

  const manualFobs: number[] = [];
  {
    let fob = aircraft.initFuelGal;
    for (let i = 0; i < manualUplifts.length; i++) {
      fob += manualUplifts[i];
      manualFobs.push(fob);
      if (i < legs.length) { fob -= legs[i].actualBurnGal; }
    }
  }

  const icaoLabels = stops.map(s => s.icao || `Stop ${s}`);

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Scenario Comparison
      </Typography>

      <Grid container spacing={2}>
        {/* Column A — Minimum */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Minimum (no tankering)
              </Typography>
              <Stack spacing={0.5}>
                {minimumPlan.map((p, i) => (
                  <Stack key={i} direction="row" justifyContent="space-between">
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{stops[i].icao}</Typography>
                    <Typography variant="body2">
                      Buy {formatFuel(p.upliftGal, fu)} for {formatDollars(p.cost)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight="medium">Total:</Typography>
                  <Typography fontWeight="medium">{formatDollars(minTotal)}</Typography>
                </Stack>
              </Box>
              <Box sx={{ mt: 2 }}>
                <FOBChart fobs={minFobs} labels={icaoLabels} maxFuel={aircraft.maxFuelGal} reserveFuel={aircraft.reserveFuelGal} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Column B — Manual */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%', borderColor: 'primary.main' }}>
            <CardContent>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Manual
              </Typography>
              <Stack spacing={1}>
                {stops.map((stop, i) => {
                  const delta = (manualUplifts[i] * stop.fuelPricePerGal) - minimumPlan[i].cost;
                  return (
                    <Box key={i}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', width: 48 }}>{stop.icao}</Typography>
                        <TextField
                          type="number"
                          size="small"
                          value={manualUplifts[i] || 0}
                          onChange={e => {
                            const newUplifts = [...manualUplifts];
                            newUplifts[i] = parseFloat(e.target.value) || 0;
                            setManualUplifts(newUplifts);
                          }}
                          slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right', fontFamily: 'monospace' } } }}
                          InputProps={{ endAdornment: <InputAdornment position="end">{fu}</InputAdornment> }}
                          fullWidth
                        />
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" sx={{ pl: 7 }}>
                        <Typography variant="caption" color="text.disabled">
                          {formatDollars(manualCosts[i])}
                        </Typography>
                        <Typography variant="caption" sx={{ color: delta > 0 ? 'error.main' : delta < 0 ? 'success.main' : 'text.disabled' }}>
                          {delta > 0 ? '+' : ''}{formatDollars(delta)} vs min
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
              {manualViolations.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {manualViolations.map((v, i) => (
                    <Typography key={i} variant="caption" color="error">{v}</Typography>
                  ))}
                </Box>
              )}
              <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight="medium">Total:</Typography>
                  <Typography fontWeight="medium">{formatDollars(manualTotal)}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: manualTotal < minTotal ? 'success.main' : 'error.main' }}>
                  {formatSavings(minTotal - manualTotal)} vs minimum
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <FOBChart fobs={manualFobs} labels={icaoLabels} maxFuel={aircraft.maxFuelGal} reserveFuel={aircraft.reserveFuelGal} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Column C — Optimized */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%', borderColor: 'success.main' }}>
            <CardContent>
              <Typography variant="subtitle2" color="success.main" gutterBottom>
                Optimized (recommended)
              </Typography>
              <Stack spacing={0.5}>
                {optimizedPlan.map((p, i) => (
                  <Stack key={i} direction="row" justifyContent="space-between">
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{stops[i].icao}</Typography>
                    <Typography
                      variant="body2"
                      sx={p.extraBuyGal > 0 ? { fontWeight: 'medium', color: 'success.main' } : undefined}
                    >
                      Buy {formatFuel(p.upliftGal, fu)} for {formatDollars(p.cost)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight="medium">Total:</Typography>
                  <Typography fontWeight="medium">{formatDollars(optTotal)}</Typography>
                </Stack>
                {minTotal - optTotal > 0 && (
                  <Typography variant="caption" color="success.main" fontWeight="medium">
                    {formatSavings(minTotal - optTotal)} saved ({((minTotal - optTotal) / minTotal * 100).toFixed(1)}%)
                  </Typography>
                )}
              </Box>
              <Box sx={{ mt: 2 }}>
                <FOBChart fobs={optFobs} labels={icaoLabels} maxFuel={aircraft.maxFuelGal} reserveFuel={aircraft.reserveFuelGal} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
