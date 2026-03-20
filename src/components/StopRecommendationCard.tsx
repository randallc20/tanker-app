import { useState } from 'react';
import {
  Card, CardContent, Typography, Stack, Box, Alert, Button, Collapse,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import type { UpliftPlan, Stop } from '../lib/types';
import { formatDollars, formatFuel, formatFuelPrice } from '../lib/formatters';
import { fuelUnit } from '../lib/units';

interface StopRecommendationCardProps {
  plan: UpliftPlan;
  stop: Stop;
  airportName: string;
  metric: boolean;
  maxFuelGal: number;
  reserveFuelGal: number;
  windNote?: string;
}

export default function StopRecommendationCard({
  plan, stop, airportName, metric, maxFuelGal, reserveFuelGal, windNote,
}: StopRecommendationCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const fu = fuelUnit(metric);

  const withinCapacity = plan.fobAfterUplift <= maxFuelGal;
  const aboveReserve = plan.fobAfterUplift >= reserveFuelGal;
  const withinAvailability = stop.availableGal <= 0 || plan.upliftGal <= stop.availableGal;
  const rampHandled = stop.rampFee <= 0 || plan.rampFeeWaived || plan.rampFeePaid > 0;

  const baseFuelCost = plan.mustBuyGal * stop.fuelPricePerGal;
  const tankerFuelCost = plan.extraBuyGal * stop.fuelPricePerGal;
  const penaltyCost = plan.penaltyBurnGal * stop.fuelPricePerGal;

  return (
    <Card variant="outlined">
      <CardContent>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
              {stop.icao}
            </Typography>
            <Typography variant="body2" color="text.secondary">{airportName}</Typography>
            <Typography variant="body2" color="text.disabled">{formatFuelPrice(stop.fuelPricePerGal, fu)}</Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="h5" fontWeight="bold" sx={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
              {formatFuel(plan.upliftGal, fu)}
            </Typography>
            <Typography variant="caption" color="text.disabled">Buy</Typography>
          </Box>
        </Stack>

        {/* Reason */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {plan.reason}
        </Typography>

        {/* Ramp fee note */}
        {plan.rampFeeNote && (
          <Alert severity="info" variant="outlined" sx={{ mb: 1, py: 0 }}>
            <Typography variant="body2">{plan.rampFeeNote}</Typography>
          </Alert>
        )}

        {/* Wind note */}
        {windNote && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {windNote}
          </Typography>
        )}

        {/* Constraint checklist */}
        <Stack spacing={0.25} sx={{ mb: 1.5 }}>
          <ConstraintCheck ok={withinCapacity} label="Within tank capacity" />
          <ConstraintCheck ok={aboveReserve} label="Above reserve minimum" />
          <ConstraintCheck ok={withinAvailability} label="Within FBO availability" />
          <ConstraintCheck ok={rampHandled} label="Ramp fee handled" />
        </Stack>

        {/* Cost breakdown */}
        <Button variant="text" size="small" onClick={() => setShowBreakdown(!showBreakdown)}>
          {showBreakdown ? '▾' : '▸'} Cost breakdown
        </Button>
        <Collapse in={showBreakdown}>
          <Stack spacing={0.5} sx={{ mt: 1, fontVariantNumeric: 'tabular-nums' }}>
            <BreakdownRow
              label={`Base fuel (${Math.round(plan.mustBuyGal)} ${fu} \u00D7 ${formatFuelPrice(stop.fuelPricePerGal, fu)})`}
              value={baseFuelCost}
            />
            {plan.extraBuyGal > 0 && (
              <BreakdownRow
                label={`Tanker fuel (${Math.round(plan.extraBuyGal)} ${fu} \u00D7 ${formatFuelPrice(stop.fuelPricePerGal, fu)})`}
                value={tankerFuelCost}
              />
            )}
            {plan.penaltyBurnGal > 0 && (
              <BreakdownRow
                label={`Burn penalty cost (${Math.round(plan.penaltyBurnGal)} ${fu})`}
                value={-penaltyCost}
                negative
              />
            )}
            <BreakdownRow
              label="Ramp fee"
              value={plan.rampFeePaid}
              note={plan.rampFeeWaived ? 'Waived' : undefined}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="body2" fontWeight="medium">Net cost at this stop</Typography>
              <Typography variant="body2" fontWeight="medium">{formatDollars(plan.cost)}</Typography>
            </Stack>
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

function ConstraintCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      {ok
        ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
        : <CancelOutlinedIcon sx={{ fontSize: 16, color: 'error.main' }} />
      }
      <Typography variant="caption" sx={{ color: ok ? 'success.main' : 'error.main' }}>
        {label}
      </Typography>
    </Stack>
  );
}

function BreakdownRow({
  label, value, negative, note,
}: { label: string; value: number; negative?: boolean; note?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={negative ? { color: 'error.main' } : undefined}>
        {note ?? formatDollars(Math.abs(value))}
        {negative && value !== 0 ? ` (\u2212${formatDollars(Math.abs(value))})` : ''}
      </Typography>
    </Stack>
  );
}
