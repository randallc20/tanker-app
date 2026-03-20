import type { LegAnalysis } from '../lib/types';
import { formatDollars, formatFuelPrice, formatRatio, formatFlightTime, formatDistance, formatFuel } from '../lib/formatters';
import { distanceUnit, fuelUnit } from '../lib/units';
import { TooltipTerm } from './Tooltip';
import { useState } from 'react';
import {
  Box, Typography, Chip, Button, Collapse,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';

interface TankeringTableProps {
  legAnalyses: LegAnalysis[];
  multiLegAnalyses: LegAnalysis[];
  metric: boolean;
}

function VerdictBadge({ verdict }: { verdict: LegAnalysis['verdict'] }) {
  const colorMap: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
    tanker: 'success',
    dont_tanker: 'error',
    marginal: 'warning',
    ramp_fee_changes: 'info',
  };
  const labels: Record<string, string> = {
    tanker: 'Tanker',
    dont_tanker: "Don't tanker",
    marginal: 'Marginal',
    ramp_fee_changes: 'Ramp fee changes this',
  };

  return <Chip size="small" label={labels[verdict]} color={colorMap[verdict]} variant="outlined" />;
}

export default function TankeringTable({ legAnalyses, multiLegAnalyses, metric }: TankeringTableProps) {
  const [showMultiLeg, setShowMultiLeg] = useState(false);
  const fu = fuelUnit(metric);
  const du = distanceUnit(metric);

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Per-Leg Tankering Analysis
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          <TableHead>
            <TableRow>
              <TableCell>Leg</TableCell>
              <TableCell><TooltipTerm term="Distance" tooltipKey="great_circle_distance" /></TableCell>
              <TableCell>Flight time</TableCell>
              <TableCell>Burn</TableCell>
              <TableCell>Origin $</TableCell>
              <TableCell>Dest $</TableCell>
              <TableCell><TooltipTerm term="Delivery" tooltipKey="delivery_ratio" /></TableCell>
              <TableCell><TooltipTerm term="Break-even" tooltipKey="break_even_price" /></TableCell>
              <TableCell><TooltipTerm term="Eff. cost" tooltipKey="effective_delivered_cost" /></TableCell>
              <TableCell>Savings/gal</TableCell>
              <TableCell>Verdict</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {legAnalyses.map((leg, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {leg.fromIcao} → {leg.toIcao}
                </TableCell>
                <TableCell>{formatDistance(leg.distanceNm, du)}</TableCell>
                <TableCell>{formatFlightTime(leg.flightTimeHrs)}</TableCell>
                <TableCell>{formatFuel(leg.actualBurnGal, fu)}</TableCell>
                <TableCell>{formatFuelPrice(leg.originPrice, fu)}</TableCell>
                <TableCell>{formatFuelPrice(leg.destPrice, fu)}</TableCell>
                <TableCell>{formatRatio(leg.deliveryRatio)}</TableCell>
                <TableCell>{formatFuelPrice(leg.breakEvenPrice, fu)}</TableCell>
                <TableCell>{formatFuelPrice(leg.effectiveDeliveredCost, fu)}</TableCell>
                <TableCell
                  sx={{
                    fontWeight: 'medium',
                    color: leg.savingsPerGal > 0.05 ? 'success.main'
                      : leg.savingsPerGal < -0.05 ? 'error.main'
                      : 'text.secondary',
                  }}
                >
                  {leg.savingsPerGal >= 0 ? '+' : ''}${leg.savingsPerGal.toFixed(2)}
                </TableCell>
                <TableCell><VerdictBadge verdict={leg.verdict} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {multiLegAnalyses.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button variant="text" size="small" onClick={() => setShowMultiLeg(!showMultiLeg)}>
            {showMultiLeg ? '▾' : '▸'} Multi-leg tankering ({multiLegAnalyses.length} pair{multiLegAnalyses.length !== 1 ? 's' : ''})
          </Button>
          <Collapse in={showMultiLeg}>
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Route</TableCell>
                    <TableCell>Compound delivery</TableCell>
                    <TableCell>Eff. cost</TableCell>
                    <TableCell>Dest price</TableCell>
                    <TableCell>Savings/gal</TableCell>
                    <TableCell>Verdict</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {multiLegAnalyses.map((leg, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {leg.fromIcao} → {leg.toIcao}
                      </TableCell>
                      <TableCell>{formatRatio(leg.deliveryRatio)}</TableCell>
                      <TableCell>{formatFuelPrice(leg.effectiveDeliveredCost, fu)}</TableCell>
                      <TableCell>{formatFuelPrice(leg.destPrice, fu)}</TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 'medium',
                          color: leg.savingsPerGal > 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {leg.savingsPerGal >= 0 ? '+' : ''}${leg.savingsPerGal.toFixed(2)}
                      </TableCell>
                      <TableCell><VerdictBadge verdict={leg.verdict} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

export { VerdictBadge };
