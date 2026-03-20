import type { Airport } from '../lib/types';
import { greatCircleDistanceNm } from '../lib/distance';
import { distanceUnit, fuelUnit } from '../lib/units';
import {
  Box, Typography, TextField, IconButton, Button, Card, CardContent, Stack, InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RestoreIcon from '@mui/icons-material/Restore';

export interface StopInput {
  icao: string;
  fuelPrice: number;
  rampFee: number;
  minWaiverGal: number;
  distanceToNext: number | null;
  distanceOverride: boolean;
  airport: Airport | null;
}

interface RouteBuilderProps {
  stops: StopInput[];
  onStopsChange: (stops: StopInput[]) => void;
  airports: Airport[];
  metric: boolean;
  showRampFees: boolean;
}

const MAX_STOPS = 10;
const MIN_STOPS = 2;

function lookupAirport(icao: string, airports: Airport[]): Airport | null {
  if (icao.length !== 4) return null;
  return airports.find(a => a.icao === icao.toUpperCase()) ?? null;
}

export default function RouteBuilder({ stops, onStopsChange, airports, metric, showRampFees }: RouteBuilderProps) {
  const updateStop = (index: number, updates: Partial<StopInput>) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], ...updates };

    if (updates.icao !== undefined) {
      const icao = updates.icao.toUpperCase().slice(0, 4);
      newStops[index].icao = icao;
      newStops[index].airport = lookupAirport(icao, airports);

      if (index < newStops.length - 1 && !newStops[index].distanceOverride) {
        const next = newStops[index + 1];
        if (newStops[index].airport && next.airport) {
          newStops[index].distanceToNext = Math.round(
            greatCircleDistanceNm(
              newStops[index].airport!.lat, newStops[index].airport!.lon,
              next.airport.lat, next.airport.lon
            )
          );
        }
      }
      if (index > 0 && !newStops[index - 1].distanceOverride) {
        const prev = newStops[index - 1];
        if (prev.airport && newStops[index].airport) {
          newStops[index - 1].distanceToNext = Math.round(
            greatCircleDistanceNm(
              prev.airport.lat, prev.airport.lon,
              newStops[index].airport!.lat, newStops[index].airport!.lon
            )
          );
        }
      }
    }

    onStopsChange(newStops);
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    onStopsChange([
      ...stops,
      { icao: '', fuelPrice: 0, rampFee: 0, minWaiverGal: 0, distanceToNext: null, distanceOverride: false, airport: null },
    ]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= MIN_STOPS) return;
    const newStops = stops.filter((_, i) => i !== index);
    for (let i = 0; i < newStops.length - 1; i++) {
      if (!newStops[i].distanceOverride && newStops[i].airport && newStops[i + 1].airport) {
        newStops[i].distanceToNext = Math.round(
          greatCircleDistanceNm(
            newStops[i].airport!.lat, newStops[i].airport!.lon,
            newStops[i + 1].airport!.lat, newStops[i + 1].airport!.lon
          )
        );
      }
    }
    onStopsChange(newStops);
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= stops.length) return;
    const newStops = [...stops];
    [newStops[index], newStops[newIdx]] = [newStops[newIdx], newStops[index]];
    for (let i = 0; i < newStops.length - 1; i++) {
      if (!newStops[i].distanceOverride && newStops[i].airport && newStops[i + 1].airport) {
        newStops[i].distanceToNext = Math.round(
          greatCircleDistanceNm(
            newStops[i].airport!.lat, newStops[i].airport!.lon,
            newStops[i + 1].airport!.lat, newStops[i + 1].airport!.lon
          )
        );
      }
    }
    onStopsChange(newStops);
  };

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Trip Route
      </Typography>

      <Stack spacing={1}>
        {stops.map((stop, i) => (
          <Box key={i}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  {/* Stop number & reorder */}
                  <Stack alignItems="center" spacing={0} sx={{ pt: 1 }}>
                    <Typography variant="caption" fontWeight="bold" color="text.disabled">
                      {i + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => moveStop(i, 'up')}
                      disabled={i === 0}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => moveStop(i, 'down')}
                      disabled={i === stops.length - 1}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>

                  {/* Fields */}
                  <Grid container spacing={1.5} sx={{ flex: 1 }}>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <TextField
                        label="ICAO Code"
                        size="small"
                        fullWidth
                        value={stop.icao}
                        onChange={e => updateStop(i, { icao: e.target.value.toUpperCase() })}
                        slotProps={{ htmlInput: { maxLength: 4, style: { textTransform: 'uppercase', fontFamily: 'monospace' } } }}
                        placeholder="KJFK"
                        helperText={
                          stop.airport
                            ? `${stop.airport.name}, ${stop.airport.city}`
                            : stop.icao.length === 4
                            ? 'Airport not found'
                            : undefined
                        }
                        error={stop.icao.length === 4 && !stop.airport}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <TextField
                        label="Fuel price"
                        size="small"
                        fullWidth
                        type="number"
                        value={stop.fuelPrice || ''}
                        onChange={e => updateStop(i, { fuelPrice: parseFloat(e.target.value) || 0 })}
                        slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                        placeholder="5.25"
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          endAdornment: <InputAdornment position="end">/gal</InputAdornment>,
                        }}
                      />
                    </Grid>
                    {showRampFees && (
                      <>
                        <Grid size={{ xs: 6, sm: 4 }}>
                          <TextField
                            label="Ramp fee"
                            size="small"
                            fullWidth
                            type="number"
                            value={stop.rampFee || ''}
                            onChange={e => updateStop(i, { rampFee: parseFloat(e.target.value) || 0 })}
                            slotProps={{ htmlInput: { step: 1, min: 0 } }}
                            placeholder="0"
                            InputProps={{
                              startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                          <TextField
                            label="Min gal to waive"
                            size="small"
                            fullWidth
                            type="number"
                            value={stop.minWaiverGal || ''}
                            onChange={e => updateStop(i, { minWaiverGal: parseFloat(e.target.value) || 0 })}
                            slotProps={{ htmlInput: { step: 1, min: 0 } }}
                            placeholder="0"
                          />
                        </Grid>
                      </>
                    )}
                  </Grid>

                  {/* Remove button */}
                  <IconButton
                    color="error"
                    onClick={() => removeStop(i)}
                    disabled={stops.length <= MIN_STOPS}
                    title="Remove stop"
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              </CardContent>
            </Card>

            {/* Leg distance */}
            {i < stops.length - 1 && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 5, py: 0.5 }}>
                <Box sx={{ width: 2, height: 24, bgcolor: 'divider' }} />
                <Typography variant="caption" color="text.disabled">Distance:</Typography>
                <TextField
                  type="number"
                  size="small"
                  value={stop.distanceToNext ?? ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    updateStop(i, {
                      distanceToNext: isNaN(val) ? null : val,
                      distanceOverride: !isNaN(val),
                    });
                  }}
                  placeholder="auto"
                  sx={{ width: 100 }}
                  slotProps={{ htmlInput: { style: { textAlign: 'center' } } }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">{distanceUnit(metric)}</InputAdornment>,
                  }}
                  color={stop.distanceOverride ? 'primary' : undefined}
                />
                {stop.distanceOverride && (
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => {
                      const next = stops[i + 1];
                      let auto: number | null = null;
                      if (stop.airport && next?.airport) {
                        auto = Math.round(greatCircleDistanceNm(
                          stop.airport.lat, stop.airport.lon,
                          next.airport.lat, next.airport.lon
                        ));
                      }
                      updateStop(i, { distanceToNext: auto, distanceOverride: false });
                    }}
                    title="Reset to auto-calculated"
                  >
                    <RestoreIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      {stops.length < MAX_STOPS && (
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddIcon />}
          onClick={addStop}
          sx={{ mt: 1, borderStyle: 'dashed', minHeight: 44 }}
        >
          Add stop
        </Button>
      )}
    </Box>
  );
}
