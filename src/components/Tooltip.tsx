import type { ReactNode } from 'react';
import MuiTooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Tooltip content map for aviation terms
export const TOOLTIP_CONTENT: Record<string, string> = {
  'delivery_ratio': "Of every gallon you load at the origin, this percentage actually arrives at the destination. The rest is burned to haul the extra weight. A 93% ratio means you need to buy about 1.075 gallons here for every 1 gallon you want to have there.",
  'break_even_price': "The highest price at the destination where tankering still saves you money. If the destination price is above this number, buy more fuel here. If it's below, don't bother.",
  'burn_penalty': "Every extra gallon you carry costs you fuel to haul it. This is the penalty rate — the percentage of the extra fuel that gets burned per hour of flight just to carry itself. Typical values: 2–3% for pistons, 3–4% for turboprops, 3–5% for jets.",
  'effective_delivered_cost': "What each tankered gallon actually costs you, fully loaded at the destination. This accounts for the burn penalty and any ramp fees. Compare this directly to the destination price to know if tankering makes sense.",
  'reserve_fuel': "The minimum fuel you must have on board when you land. For IFR flight this is typically 45 minutes of fuel at normal cruise. The optimizer will never plan a flight that arrives with less than this amount.",
  'ramp_fee': "A handling fee charged by the FBO just for using their ramp. Most FBOs waive it if you buy a minimum number of gallons. Enter both the fee and the threshold and the optimizer will account for it.",
  'great_circle_distance': "The shortest path between two airports on the surface of the earth. Actual flight distance may be longer due to airways, airspace restrictions, or SID/STAR routing. You can override this with your actual planned distance.",
  'winds_aloft': "Winds at cruise altitude affect how long the flight takes and how much fuel it burns. A 50-knot headwind on a 450-knot aircraft adds 11% to flight time and fuel burn. Always use forecast or actual winds for long legs.",
  'verified_badge': "Performance data for this aircraft was sourced directly from the official FAA-approved Flight Planning Guide or POH. Values are derived from primary source tables. You should still enter your actual observed burn rate for best accuracy.",
  'manufacturer_spec_badge': "Performance data sourced from manufacturer-published spec sheets or marketing materials. Weights and fuel capacity are reliable. Burn rate reflects the manufacturer's typical figure, which is often 5–10% optimistic compared to real-world operations.",
  'community_estimate_badge': "Performance data compiled from aviation reference sites and operator reports. Weights are generally reliable. Treat the burn rate as a rough starting point and enter your actual observed numbers before making fuel decisions.",
};

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <MuiTooltip title={content} arrow placement="top" enterTouchDelay={0}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{children}</span>
    </MuiTooltip>
  );
}

/** Helper: wraps text with a dotted underline and tooltip icon */
export function TooltipTerm({ term, tooltipKey }: { term: string; tooltipKey: string }) {
  const content = TOOLTIP_CONTENT[tooltipKey] ?? '';
  return (
    <Tooltip content={content}>
      <Typography
        component="span"
        variant="inherit"
        sx={{ borderBottom: '1px dotted', borderColor: 'text.disabled', cursor: 'help' }}
      >
        {term}
      </Typography>
      <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
        &#9432;
      </Typography>
    </Tooltip>
  );
}
