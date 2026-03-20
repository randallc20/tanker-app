import { useState } from 'react';
import {
  Box, Typography, TextField, IconButton, Button, Collapse, Stack, InputAdornment, Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import RestoreIcon from '@mui/icons-material/Restore';
import type { AircraftDefinition } from '../lib/types';
import { fuelUnit } from '../lib/units';
import { ConfidenceBadge } from './AircraftPicker';
import { TooltipTerm } from './Tooltip';

interface AircraftConfigProps {
  aircraft: AircraftDefinition;
  overrides: Partial<AircraftConfigOverrides>;
  onOverride: (overrides: Partial<AircraftConfigOverrides>) => void;
  metric: boolean;
}

export interface AircraftConfigOverrides {
  burnRateGph: number;
  cruiseSpeedKts: number;
  maxFuelGal: number;
  reserveFuelGal: number;
  burnPenaltyPctPerHr: number;
}

export default function AircraftConfig({ aircraft, overrides, onOverride, metric }: AircraftConfigProps) {
  const [showSpecs, setShowSpecs] = useState(false);

  const burnRate = overrides.burnRateGph ?? aircraft.typicalBurnGph;
  const cruiseSpeed = overrides.cruiseSpeedKts ?? aircraft.cruiseSpeedKts;
  const maxFuel = overrides.maxFuelGal ?? aircraft.maxFuelGal;
  const reserves = overrides.reserveFuelGal ?? aircraft.reservesTypicalGal;
  const penalty = overrides.burnPenaltyPctPerHr ?? aircraft.burnPenaltyPerHrPct;

  const editableField = (
    label: string,
    value: number,
    key: keyof AircraftConfigOverrides,
    unit: string,
    defaultVal: number,
    tooltip?: string,
    step: number = 1
  ) => {
    const isOverridden = overrides[key] !== undefined && overrides[key] !== defaultVal;
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {tooltip ? <TooltipTerm term={label} tooltipKey={tooltip} /> : label}
          </Typography>
          {isOverridden && (
            <IconButton
              size="small"
              color="primary"
              onClick={() => {
                const next = { ...overrides };
                delete next[key];
                onOverride(next);
              }}
              title="Reset to default"
              sx={{ p: 0.25 }}
            >
              <RestoreIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Stack>
        <TextField
          type="number"
          size="small"
          fullWidth
          value={value}
          onChange={e => onOverride({ ...overrides, [key]: parseFloat(e.target.value) || 0 })}
          slotProps={{ htmlInput: { step } }}
          InputProps={{
            endAdornment: <InputAdornment position="end">{unit}</InputAdornment>,
          }}
          sx={isOverridden ? {
            '& .MuiOutlinedInput-root': {
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
            },
          } : undefined}
        />
        {key === 'burnRateGph' && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
            Range: {aircraft.burnRangeGph[0]}–{aircraft.burnRangeGph[1]} {fuelUnit(metric)}/hr
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
        <ConfidenceBadge confidence={aircraft.confidence} />
        <Typography variant="body2" color="text.secondary">
          {aircraft.dataSource}, {aircraft.dataSourceDate}
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, lg: 2.4 }}>
          {editableField('Burn rate', burnRate, 'burnRateGph', `${fuelUnit(metric)}/hr`, aircraft.typicalBurnGph, undefined, 1)}
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2.4 }}>
          {editableField('Cruise speed', cruiseSpeed, 'cruiseSpeedKts', 'kts', aircraft.cruiseSpeedKts, undefined, 1)}
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2.4 }}>
          {editableField('Max fuel', maxFuel, 'maxFuelGal', fuelUnit(metric), aircraft.maxFuelGal, undefined, 1)}
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2.4 }}>
          {editableField('Reserve fuel', reserves, 'reserveFuelGal', fuelUnit(metric), aircraft.reservesTypicalGal, 'reserve_fuel', 1)}
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2.4 }}>
          {editableField('Burn penalty', penalty, 'burnPenaltyPctPerHr', '%/hr', aircraft.burnPenaltyPerHrPct, 'burn_penalty', 0.1)}
        </Grid>
      </Grid>

      <Box sx={{ mt: 2 }}>
        <Button variant="text" size="small" onClick={() => setShowSpecs(!showSpecs)}>
          {showSpecs ? '▾' : '▸'} View specs
        </Button>
        <Collapse in={showSpecs}>
          <Box sx={{ mt: 1, p: 2, borderRadius: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Max ramp weight" value={`${aircraft.maxRampWeightLbs.toLocaleString()} lbs`} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Max zero fuel weight" value={`${aircraft.maxZeroFuelWeightLbs.toLocaleString()} lbs`} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Basic operating weight" value={`${aircraft.basicOperatingWeightLbs.toLocaleString()} lbs`} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Max payload" value={`${aircraft.maxPayloadLbs.toLocaleString()} lbs`} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Fuel type" value={aircraft.fuelType} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Engines" value={aircraft.engines} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="NBAA IFR reserves" value={`${aircraft.reservesNbaaGal} ${fuelUnit(metric)}`} /></Grid>
              <Grid size={{ xs: 6, sm: 4 }}><SpecRow label="Tabs only" value={aircraft.tabsOnlyGal ? `${aircraft.tabsOnlyGal} ${fuelUnit(metric)}` : 'N/A'} /></Grid>
            </Grid>
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" fontWeight="medium" color="text.secondary">
                Data confidence by field:
              </Typography>
              <Stack direction="row" flexWrap="wrap" spacing={1} sx={{ mt: 0.5 }}>
                <ConfField label="Weights" tier={aircraft.confidence.weights} />
                <ConfField label="Fuel capacity" tier={aircraft.confidence.fuelCapacity} />
                <ConfField label="Burn rate" tier={aircraft.confidence.burnRate} />
                <ConfField label="Burn penalty" tier={aircraft.confidence.burnPenalty} />
                <ConfField label="Reserves" tier={aircraft.confidence.reserves} />
              </Stack>
            </Box>
            {aircraft.operatorNotes && (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" fontWeight="medium" color="text.secondary">
                  Operator notes:
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {aircraft.operatorNotes.split(' | ').map((note, i) => (
                    <span key={i} style={{ display: 'block' }}>&bull; {note}</span>
                  ))}
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </Box>

      <Alert severity="warning" variant="outlined" sx={{ mt: 2, py: 0 }}>
        <Typography variant="caption">
          Performance data is for fuel cost planning only. It is not a substitute for your FAA-approved AFM. Always verify fuel loads with your actual POH.
        </Typography>
      </Alert>
    </Box>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <Typography variant="caption">
      <Typography component="span" variant="caption" color="text.secondary">{label}: </Typography>
      <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace' }}>{value}</Typography>
    </Typography>
  );
}

function ConfField({ label, tier }: { label: string; tier: string }) {
  const tierLabel = tier === 'verified' ? 'Verified' : tier === 'manufacturer_spec' ? 'Mfr spec' : 'Community est.';
  return (
    <Typography variant="caption" color="text.secondary">
      {label}: {tierLabel}
    </Typography>
  );
}
