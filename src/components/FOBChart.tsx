import { useTheme } from '@mui/material/styles';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

interface FOBChartProps {
  fobs: number[];
  labels: string[];
  maxFuel: number;
  reserveFuel: number;
}

export default function FOBChart({ fobs, labels, maxFuel, reserveFuel }: FOBChartProps) {
  const theme = useTheme();
  const errorColor = theme.palette.error.main;
  const secondaryColor = theme.palette.secondary.main;
  const textSecondary = theme.palette.text.secondary;
  const dividerColor = theme.palette.divider;

  const data = fobs.map((fob, i) => ({
    name: labels[i] || `Stop ${i + 1}`,
    fob: Math.round(fob),
    belowReserve: fob < reserveFuel,
  }));

  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={dividerColor} opacity={0.4} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke={textSecondary} />
          <YAxis
            domain={[0, Math.max(maxFuel * 1.05, ...fobs)]}
            tick={{ fontSize: 10 }}
            stroke={textSecondary}
            width={45}
          />
          <RTooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${dividerColor}`,
              borderRadius: '8px',
              color: theme.palette.text.primary,
              fontSize: '12px',
            }}
            formatter={(value) => [`${Number(value).toLocaleString()} gal`, 'FOB']}
          />
          <ReferenceLine
            y={reserveFuel}
            stroke={errorColor}
            strokeDasharray="5 5"
            label={{ value: 'Reserve', position: 'right', fontSize: 10, fill: errorColor }}
          />
          <ReferenceLine
            y={maxFuel}
            stroke={textSecondary}
            strokeDasharray="5 5"
            label={{ value: 'Max', position: 'right', fontSize: 10, fill: textSecondary }}
          />
          <Line
            type="monotone"
            dataKey="fob"
            stroke={secondaryColor}
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const color = payload.belowReserve ? errorColor : secondaryColor;
              return (
                <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke={color} />
              );
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
