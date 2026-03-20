import { useState } from 'react';
import {
  Accordion, AccordionSummary, AccordionDetails, Typography, TextField,
  Select, MenuItem, FormControl, InputLabel, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Checkbox, Slider, Stack, Box, InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { WindInput } from '../lib/types';
import { TooltipTerm } from './Tooltip';
import { celsiusToFahrenheit, fahrenheitToCelsius } from '../lib/units';

interface AdvancedFactorsProps {
  winds: (WindInput | null)[];
  onWindsChange: (winds: (WindInput | null)[]) => void;
  legCount: number;
  legLabels: string[];
  oatCelsius: number | null;
  onOatChange: (oat: number | null) => void;
  rampWeightLbs: number;
  onRampWeightChange: (weight: number) => void;
  maxRampWeightLbs: number;
  weightSensitivity: number;
  onWeightSensitivityChange: (ws: number) => void;
  stops: { icao: string; isFuelOnlyStop: boolean; extraGroundTimeMin: number; crewCostPerHr: number }[];
  onStopUpdate: (index: number, updates: { isFuelOnlyStop?: boolean; extraGroundTimeMin?: number; crewCostPerHr?: number }) => void;
  carbonOffsetPerTonne: number;
  onCarbonOffsetChange: (cost: number) => void;
}

export default function AdvancedFactors({
  winds, onWindsChange, legCount, legLabels,
  oatCelsius, onOatChange,
  rampWeightLbs, onRampWeightChange, maxRampWeightLbs,
  weightSensitivity, onWeightSensitivityChange,
  stops, onStopUpdate,
  carbonOffsetPerTonne, onCarbonOffsetChange,
}: AdvancedFactorsProps) {
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');

  return (
    <Accordion
      variant="outlined"
      disableGutters
      sx={{ borderRadius: '12px !important', '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={500}>Advanced Factors</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={3}>
          {/* Winds Aloft */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              <TooltipTerm term="Winds Aloft" tooltipKey="winds_aloft" /> (per leg)
            </Typography>
            <Stack spacing={1}>
              {Array.from({ length: legCount }).map((_, i) => {
                const wind = winds[i] ?? null;
                const mode = wind?.mode ?? 'burn_adjustment';
                return (
                  <Stack key={i} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 110 }} color="text.disabled">
                      {legLabels[i]}
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <Select
                        value={mode}
                        onChange={e => {
                          const newWinds = [...winds];
                          const newMode = e.target.value as WindInput['mode'];
                          newWinds[i] = { mode: newMode, burnAdjustmentPct: 0, headwindKts: 0 };
                          onWindsChange(newWinds);
                        }}
                      >
                        <MenuItem value="burn_adjustment">Burn % adjust</MenuItem>
                        <MenuItem value="headwind_tailwind">Headwind/tailwind</MenuItem>
                        <MenuItem value="live_forecast">Live forecast</MenuItem>
                      </Select>
                    </FormControl>

                    {mode === 'burn_adjustment' && (
                      <TextField
                        type="number"
                        size="small"
                        value={wind?.burnAdjustmentPct ?? 0}
                        onChange={e => {
                          const newWinds = [...winds];
                          newWinds[i] = { mode: 'burn_adjustment', burnAdjustmentPct: parseFloat(e.target.value) || 0 };
                          onWindsChange(newWinds);
                        }}
                        slotProps={{ htmlInput: { min: -30, max: 30, step: 1 } }}
                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        sx={{ width: 100 }}
                      />
                    )}

                    {mode === 'headwind_tailwind' && (
                      <TextField
                        type="number"
                        size="small"
                        value={wind?.headwindKts ?? 0}
                        onChange={e => {
                          const newWinds = [...winds];
                          newWinds[i] = { mode: 'headwind_tailwind', headwindKts: parseFloat(e.target.value) || 0 };
                          onWindsChange(newWinds);
                        }}
                        InputProps={{ endAdornment: <InputAdornment position="end">kts</InputAdornment> }}
                        sx={{ width: 100 }}
                      />
                    )}

                    {mode === 'live_forecast' && (
                      <Typography variant="caption" color="warning.main">
                        Live winds — fetched on calculate
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Box>

          {/* Fuel Density */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Fuel Density Correction
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">OAT at cruise:</Typography>
              <TextField
                type="number"
                size="small"
                value={oatCelsius !== null
                  ? (tempUnit === 'C' ? oatCelsius : Math.round(celsiusToFahrenheit(oatCelsius) * 10) / 10)
                  : ''}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (isNaN(val)) { onOatChange(null); }
                  else { onOatChange(tempUnit === 'C' ? val : fahrenheitToCelsius(val)); }
                }}
                placeholder="ISA std"
                sx={{ width: 100 }}
              />
              <ToggleButtonGroup
                value={tempUnit}
                exclusive
                size="small"
                onChange={(_, v) => v && setTempUnit(v)}
              >
                <ToggleButton value="C">&deg;C</ToggleButton>
                <ToggleButton value="F">&deg;F</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
              A 20&deg;C temperature deviation changes Jet-A density by roughly 1.4%
            </Typography>
          </Box>

          {/* Payload / Weight */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Payload / Weight Impact
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label={`Est. ramp weight (max: ${maxRampWeightLbs.toLocaleString()} lbs)`}
                  type="number"
                  size="small"
                  fullWidth
                  value={rampWeightLbs || ''}
                  onChange={e => onRampWeightChange(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Weight sensitivity"
                  type="number"
                  size="small"
                  fullWidth
                  value={weightSensitivity}
                  onChange={e => onWeightSensitivityChange(parseFloat(e.target.value) || 0.25)}
                  slotProps={{ htmlInput: { step: 0.05, min: 0, max: 1 } }}
                />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
              A fully loaded aircraft burns more fuel than an empty one. This adjusts the burn rate based on how heavy you expect to be.
            </Typography>
          </Box>

          {/* Crew Time / Fuel Stop Cost */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Fuel Stop Cost
            </Typography>
            <Stack spacing={1}>
              {stops.map((stop, i) => (
                <Stack key={i} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', width: 48 }} color="text.disabled">
                    {stop.icao}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={stop.isFuelOnlyStop}
                        onChange={e => onStopUpdate(i, { isFuelOnlyStop: e.target.checked })}
                      />
                    }
                    label={<Typography variant="caption">Fuel-only stop</Typography>}
                  />
                  {stop.isFuelOnlyStop && (
                    <>
                      <TextField
                        type="number"
                        size="small"
                        value={stop.extraGroundTimeMin}
                        onChange={e => onStopUpdate(i, { extraGroundTimeMin: parseInt(e.target.value) || 30 })}
                        InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                        sx={{ width: 90 }}
                      />
                      <TextField
                        type="number"
                        size="small"
                        value={stop.crewCostPerHr || ''}
                        onChange={e => onStopUpdate(i, { crewCostPerHr: parseFloat(e.target.value) || 0 })}
                        placeholder="$/hr"
                        InputProps={{ endAdornment: <InputAdornment position="end">$/hr crew</InputAdornment> }}
                        sx={{ width: 140 }}
                      />
                    </>
                  )}
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Carbon Offset */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Carbon Offset
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">Cost per tonne CO&#8322;:</Typography>
              <TextField
                type="number"
                size="small"
                value={carbonOffsetPerTonne || ''}
                onChange={e => onCarbonOffsetChange(parseFloat(e.target.value) || 0)}
                placeholder="0"
                slotProps={{ htmlInput: { step: 1, min: 0 } }}
                InputProps={{ endAdornment: <InputAdornment position="end">$/tonne</InputAdornment> }}
                sx={{ width: 140 }}
              />
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
              Jet-A produces 9.57 kg CO&#8322; per gallon (ICAO standard). This adds to the effective cost of each gallon burned.
            </Typography>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
