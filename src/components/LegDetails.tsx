import { Paper, Typography, Stack, Chip, Box } from '@mui/material';
import type { ComputedLeg } from '../lib/types';
import { formatDistance, formatFlightTime, formatFuel } from '../lib/formatters';
import { distanceUnit, fuelUnit } from '../lib/units';

interface LegDetailsProps {
  legs: ComputedLeg[];
  stopIcaos: string[];
  metric: boolean;
}

export default function LegDetails({ legs, stopIcaos, metric }: LegDetailsProps) {
  const fu = fuelUnit(metric);
  const du = distanceUnit(metric);

  if (legs.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" fontWeight="medium" color="text.secondary">
        Leg Summary
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {legs.map((leg, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{ px: 2, py: 1, fontVariantNumeric: 'tabular-nums' }}
          >
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
              <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 100 }} color="text.secondary">
                {stopIcaos[leg.fromIndex]} → {stopIcaos[leg.toIndex]}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDistance(leg.distanceNm, du)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatFlightTime(leg.flightTimeHrs)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatFuel(leg.actualBurnGal, fu)} burn
              </Typography>
              {leg.headwindKts !== 0 && (
                <Chip
                  size="small"
                  color={leg.headwindKts > 0 ? 'warning' : 'success'}
                  variant="outlined"
                  label={`${leg.headwindKts > 0 ? '+' : ''}${Math.round(leg.headwindKts)} kt ${leg.headwindKts > 0 ? 'headwind' : 'tailwind'}`}
                />
              )}
              {leg.effectiveGroundspeedKts !== leg.actualBurnGal && (
                <Typography variant="caption" color="text.disabled">
                  GS: {Math.round(leg.effectiveGroundspeedKts)} kts
                </Typography>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ px: 2, py: 0.5, mt: 0.5 }}>
        <Typography variant="caption" fontWeight="medium" color="text.secondary">Total:</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDistance(legs.reduce((s, l) => s + l.distanceNm, 0), du)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFlightTime(legs.reduce((s, l) => s + l.flightTimeHrs, 0))}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFuel(legs.reduce((s, l) => s + l.actualBurnGal, 0), fu)} burn
        </Typography>
      </Stack>
    </Box>
  );
}
