import { useRef, useEffect, useState } from 'react';
import { Paper, Typography, Box } from '@mui/material';
import Grid from '@mui/material/Grid';
import { formatDollars, formatFuel, formatFuelPrice, formatPct } from '../lib/formatters';
import { fuelUnit } from '../lib/units';

interface SummaryBarProps {
  totalCostOptimized: number;
  totalCostMinimum: number;
  savings: number;
  savingsPct: number;
  totalFuelUplifted: number;
  avgEffectiveCost: number;
  metric: boolean;
}

export default function SummaryBar({
  totalCostOptimized, totalCostMinimum, savings, savingsPct,
  totalFuelUplifted, avgEffectiveCost, metric,
}: SummaryBarProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { setIsSticky(!entry.isIntersecting); },
      { threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  const cards = [
    { label: 'Total trip cost', value: formatDollars(totalCostOptimized), sub: 'Optimized plan' },
    {
      label: 'Savings vs no tankering',
      value: savings >= 0 ? `+${formatDollars(savings)} (${formatPct(savingsPct)})` : `${formatDollars(savings)}`,
      sub: 'Buying minimum at each stop',
      positive: savings > 0, negative: savings < 0,
    },
    { label: 'Total fuel uplifted', value: formatFuel(totalFuelUplifted, fuelUnit(metric)), sub: 'Across all stops' },
    { label: 'Avg effective cost', value: formatFuelPrice(avgEffectiveCost, fuelUnit(metric)), sub: 'Fuel burned, fully loaded' },
  ];

  return (
    <>
      <div ref={sentinelRef} />
      <Paper
        elevation={isSticky ? 3 : 0}
        sx={{
          ...(isSticky && {
            position: 'sticky',
            top: 0,
            zIndex: 40,
            backdropFilter: 'blur(8px)',
            bgcolor: 'rgba(var(--mui-palette-background-defaultChannel) / 0.95)',
          }),
          p: 1.5,
          borderRadius: 2,
        }}
      >
        <Grid container spacing={1.5}>
          {cards.map((card, i) => (
            <Grid size={{ xs: 6, lg: 3 }} key={i}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  sx={{
                    fontFamily: 'monospace',
                    fontVariantNumeric: 'tabular-nums',
                    color: card.positive ? 'success.main' : card.negative ? 'error.main' : 'text.primary',
                  }}
                >
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.disabled">{card.sub}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </>
  );
}
