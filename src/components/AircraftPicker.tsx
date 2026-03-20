import { useState, useMemo } from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, Chip, Alert, Box, Typography, Stack,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import type { AircraftDefinition } from '../lib/types';

interface AircraftPickerProps {
  aircraft: AircraftDefinition[];
  selected: AircraftDefinition | null;
  onSelect: (aircraft: AircraftDefinition) => void;
}

export default function AircraftPicker({ aircraft, selected, onSelect }: AircraftPickerProps) {
  const [make, setMake] = useState(selected?.make ?? '');
  const [model, setModel] = useState(selected?.model ?? '');
  const [variant, setVariant] = useState(selected?.variant ?? '');

  const makes = useMemo(() => {
    const set = new Set(aircraft.map(a => a.make));
    return Array.from(set).sort();
  }, [aircraft]);

  const models = useMemo(() => {
    if (!make) return [];
    const set = new Set(aircraft.filter(a => a.make === make).map(a => a.model));
    return Array.from(set).sort();
  }, [aircraft, make]);

  const variants = useMemo(() => {
    if (!make || !model) return [];
    const filtered = aircraft.filter(a => a.make === make && a.model === model);
    const set = new Set(filtered.map(a => a.variant));
    return Array.from(set).sort();
  }, [aircraft, make, model]);

  const matches = useMemo(() => {
    if (!make || !model || !variant) return [];
    return aircraft.filter(a => a.make === make && a.model === model && a.variant === variant);
  }, [aircraft, make, model, variant]);

  const handleMakeChange = (newMake: string) => {
    setMake(newMake);
    setModel('');
    setVariant('');
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    setVariant('');
    const variants = aircraft.filter(a => a.make === make && a.model === newModel);
    const uniqueVariants = new Set(variants.map(a => a.variant));
    if (uniqueVariants.size === 1) {
      const v = Array.from(uniqueVariants)[0];
      setVariant(v);
      const final = variants.filter(a => a.variant === v);
      if (final.length === 1) onSelect(final[0]);
    }
  };

  const handleVariantChange = (newVariant: string) => {
    setVariant(newVariant);
    const final = aircraft.filter(
      a => a.make === make && a.model === model && a.variant === newVariant
    );
    if (final.length === 1) onSelect(final[0]);
  };

  const handleYearSelect = (ac: AircraftDefinition) => {
    onSelect(ac);
  };

  const yearLabel = (a: AircraftDefinition) =>
    `${a.yearStart}–${a.yearEnd ?? 'present'}`;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Aircraft Selection
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Make</InputLabel>
            <Select value={make} label="Make" onChange={e => handleMakeChange(e.target.value)}>
              <MenuItem value=""><em>Select make...</em></MenuItem>
              {makes.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <FormControl fullWidth size="small" disabled={!make}>
            <InputLabel>Model</InputLabel>
            <Select value={model} label="Model" onChange={e => handleModelChange(e.target.value)}>
              <MenuItem value=""><em>Select model...</em></MenuItem>
              {models.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <FormControl fullWidth size="small" disabled={!model}>
            <InputLabel>Variant</InputLabel>
            <Select value={variant} label="Variant" onChange={e => handleVariantChange(e.target.value)}>
              <MenuItem value=""><em>Select variant...</em></MenuItem>
              {variants.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        {matches.length > 1 && (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Year Range</InputLabel>
              <Select
                value={selected ? `${selected.yearStart}` : ''}
                label="Year Range"
                onChange={e => {
                  const ac = matches.find(a => `${a.yearStart}` === e.target.value);
                  if (ac) handleYearSelect(ac);
                }}
              >
                <MenuItem value=""><em>Select years...</em></MenuItem>
                {matches.map(a => (
                  <MenuItem key={a.yearStart} value={`${a.yearStart}`}>{yearLabel(a)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        )}
      </Grid>

      {selected && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography fontWeight="medium">
              {selected.make} {selected.model} {selected.variant !== selected.model ? selected.variant : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {yearLabel(selected)}
            </Typography>
            <ConfidenceBadge confidence={selected.confidence} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {selected.engines}
          </Typography>
          <Alert severity="warning" variant="outlined" sx={{ mt: 1, py: 0 }}>
            <Typography variant="caption">
              Performance data is for fuel cost planning only. It is not a substitute for your FAA-approved AFM. Always verify fuel loads with your actual POH.
            </Typography>
          </Alert>
        </Box>
      )}
    </Box>
  );
}

function ConfidenceBadge({ confidence }: { confidence: AircraftDefinition['confidence'] }) {
  const tiers: Array<'verified' | 'manufacturer_spec' | 'community_estimate'> = [
    confidence.weights, confidence.fuelCapacity, confidence.burnRate,
    confidence.burnPenalty, confidence.reserves,
  ];

  const isVerified = tiers.every(t => t === 'verified');
  const hasCommunity = tiers.some(t => t === 'community_estimate');

  if (isVerified) {
    return <Chip size="small" label="Verified source" color="warning" variant="outlined" />;
  }
  if (!hasCommunity) {
    return <Chip size="small" label="Manufacturer spec" color="default" variant="outlined" />;
  }
  return <Chip size="small" label="Community estimate" color="info" variant="outlined" />;
}

export { ConfidenceBadge };
