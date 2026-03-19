/**
 * About / Methodology Page
 *
 * Explains how the tankering calculator works, what data it uses,
 * and its limitations — in plain English for pilots and dispatchers.
 */

import { useTheme } from '../theme'

export default function About() {
  const { colors: c } = useTheme()

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-lg overflow-hidden mb-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
      <div className="px-5 py-3" style={{ background: c.cardAlt, borderBottom: `1px solid ${c.border}` }}>
        <h2 className="text-sm font-bold" style={{ color: c.sub }}>{title}</h2>
      </div>
      <div className="px-5 py-4 text-sm leading-relaxed" style={{ color: c.sub }}>{children}</div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: c.bg }}>
      <header className="px-6 py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
        <h1 className="text-xl font-bold" style={{ color: c.text }}>
          Methodology & Data Sources
        </h1>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        <Section title="What Is Fuel Tankering?">
          <p className="mb-3">
            Tankering means carrying extra fuel from a cheaper airport to avoid buying expensive fuel
            at your destination. The tradeoff: extra weight means extra fuel burned en route. This tool
            calculates whether the money saved exceeds the penalty cost.
          </p>
        </Section>

        <Section title="Why A Flat Percentage Is Wrong">
          <p className="mb-3">
            Many operators use a rule of thumb like "3-5% burn penalty." But the actual penalty varies
            dramatically based on:
          </p>
          <ul className="list-disc pl-5 mb-3 space-y-1">
            <li><strong style={{ color: c.text }}>Cruise mode:</strong> At High Speed Cruise (HSC), the CJ4's fuel flow barely changes
              with weight — only 13 lb/hr across the full weight range at FL390. At Long Range Cruise (LRC),
              it changes by 313 lb/hr. This is the single most important insight.</li>
            <li><strong style={{ color: c.text }}>Trip distance:</strong> Longer legs = more time carrying extra weight = more penalty.</li>
            <li><strong style={{ color: c.text }}>Altitude:</strong> Different altitudes have different fuel flow curves.</li>
            <li><strong style={{ color: c.text }}>Wind:</strong> Headwinds extend trip time, increasing the penalty.</li>
            <li><strong style={{ color: c.text }}>Temperature:</strong> Hot days increase fuel flow ~0.3% per °C above ISA.</li>
          </ul>
        </Section>

        <Section title="Data Source">
          <p className="mb-2">
            All performance data comes from the <strong style={{ color: c.text }}>Cessna CJ4 Flight Planning Guide</strong>
            (September 2012, Revisions FM-04 PP-03), derived from the CJ4 Aircraft Flight Manual
            and Electronic Operating Manual.
          </p>
          <p className="mb-2">
            The tool uses actual fuel flow tables at 6 weight columns and 16 altitude rows for both
            HSC and LRC modes. Values are bilinearly interpolated — no rounding or snapping to nearest.
          </p>
          <p style={{ color: c.accent }}>
            This tool is for planning purposes only. Always verify with current approved AFM/POH data.
          </p>
        </Section>

        <Section title="How Interpolation Works">
          <p className="mb-3">
            The POH provides fuel flow at specific weights (17,110 / 16,500 / 16,000 / 15,000 / 14,000 / 12,000 lb)
            and altitudes (FL050 through FL450). Your actual weight and altitude usually fall between these points.
          </p>
          <p className="mb-3">
            The tool uses <em>bilinear interpolation</em>: it first interpolates between the two nearest weight
            columns for the two nearest altitude rows, then interpolates between those results along the altitude
            axis. This gives a smooth, accurate estimate at any weight/altitude combination.
          </p>
        </Section>

        <Section title="Wind & Temperature Corrections">
          <p className="mb-3">
            <strong style={{ color: c.text }}>Wind:</strong> The POH includes a wind correction factor table. A 50-knot headwind at 420 KTAS
            increases trip time by ~13%. This factor is interpolated for your exact airspeed and wind component.
          </p>
          <p className="mb-3">
            <strong style={{ color: c.text }}>Temperature:</strong> All POH data assumes ISA conditions. For non-ISA days, fuel flow is
            corrected +0.3% per °C above ISA and -0.2% per °C below ISA, capped at ±15%.
          </p>
        </Section>

        <Section title="Limitations">
          <ul className="list-disc pl-5 space-y-2">
            <li>Descent fuel burn is estimated as a fixed 50 NM segment (weight-insensitive).</li>
            <li>Anti-ice ON performance data is not currently loaded.</li>
            <li>Climb table is based from sea level — high-elevation departures may have slightly different climb performance.</li>
            <li>ISA temperature corrections beyond ±20°C are less reliable.</li>
            <li>The tool currently supports the Citation CJ4 only. Additional aircraft will be added as their Flight Planning Guide data is extracted.</li>
          </ul>
        </Section>

        <Section title="HSC vs LRC — The Critical Insight">
          <p className="mb-3">
            At <strong style={{ color: c.text }}>High Speed Cruise</strong>, the engines run at maximum cruise thrust regardless of weight.
            Lighter aircraft simply accelerate to higher speeds. The fuel flow is determined primarily by the
            thrust setting, not the weight. Result: the tankering penalty is negligible at HSC.
          </p>
          <p className="mb-3">
            At <strong style={{ color: c.text }}>Long Range Cruise</strong>, the engines throttle back to optimize fuel efficiency.
            Heavier aircraft need more thrust to maintain speed, so fuel flow increases significantly with weight.
            Result: the tankering penalty is substantial at LRC and can make or break the economics.
          </p>
          <p>
            A flat percentage model completely misses this distinction. That's why this tool uses actual POH data.
          </p>
        </Section>

        <Section title="Reporting Data Errors">
          <p>
            If you find a discrepancy between this tool's data and your aircraft's approved AFM/POH,
            please report it so we can verify and correct. Accuracy depends on the underlying data being right.
          </p>
        </Section>
      </div>
    </div>
  )
}
