/**
 * Bilinear Interpolation Engine
 *
 * All fuel flow and airspeed values are bilinearly interpolated between
 * the two nearest weight columns and the two nearest altitude rows from
 * the POH performance tables. No snapping to nearest values.
 *
 * Weight columns in POH tables are NOT evenly spaced, so exact linear
 * interpolation between adjacent columns is required.
 */

/**
 * 1D linear interpolation within a weight array.
 *
 * Weights are ordered heaviest-first (descending). If the target weight
 * is outside the range, clamps to the nearest boundary value.
 *
 * @param w - Target weight (lb)
 * @param weights - Weight breakpoints (descending)
 * @param values - Corresponding values at each weight breakpoint
 * @returns Interpolated value, or null if both bounding values are null
 */
export function interpWeight(
  w: number,
  weights: number[],
  values: (number | null)[]
): number | null {
  // Weights are descending: [17110, 16500, 16000, ...]
  if (w >= weights[0]) return values[0]
  if (w <= weights[weights.length - 1]) return values[values.length - 1]

  // Find bounding indices where weights[i] >= w >= weights[i+1]
  for (let i = 0; i < weights.length - 1; i++) {
    if (w <= weights[i] && w >= weights[i + 1]) {
      const v0 = values[i]
      const v1 = values[i + 1]
      if (v0 === null && v1 === null) return null
      if (v0 === null) return v1
      if (v1 === null) return v0
      const t = (w - weights[i + 1]) / (weights[i] - weights[i + 1])
      return v1 + t * (v0 - v1)
    }
  }

  // Fallback (should not reach)
  return values[values.length - 1]
}

/**
 * 1D linear interpolation within an altitude array.
 *
 * Altitudes are ordered ascending. Clamps to boundary if outside range.
 *
 * @param alt - Target altitude (ft)
 * @param altitudes - Altitude breakpoints (ascending)
 * @param values - Corresponding values at each altitude breakpoint
 * @returns Interpolated value, or null if both bounding values are null
 */
export function interpAltitude(
  alt: number,
  altitudes: number[],
  values: (number | null)[]
): number | null {
  if (alt <= altitudes[0]) return values[0]
  if (alt >= altitudes[altitudes.length - 1]) return values[values.length - 1]

  for (let i = 0; i < altitudes.length - 1; i++) {
    if (alt >= altitudes[i] && alt <= altitudes[i + 1]) {
      const v0 = values[i]
      const v1 = values[i + 1]
      if (v0 === null && v1 === null) return null
      if (v0 === null) return v1
      if (v1 === null) return v0
      const t = (alt - altitudes[i]) / (altitudes[i + 1] - altitudes[i])
      return v0 + t * (v1 - v0)
    }
  }

  return values[values.length - 1]
}

/**
 * Bilinear interpolation: look up a value from a 2D table indexed by
 * altitude (rows) and weight (columns).
 *
 * First interpolates along the weight axis for the two bounding altitude
 * rows, then interpolates between those two results along the altitude axis.
 *
 * @param alt - Target altitude (ft)
 * @param w - Target weight (lb)
 * @param altitudes - Altitude row breakpoints (ascending)
 * @param weights - Weight column breakpoints (descending)
 * @param table - 2D data: table[altIdx][wtIdx]
 * @returns Interpolated value, or null if data unavailable at this point
 */
export function interpBilinear(
  alt: number,
  w: number,
  altitudes: number[],
  weights: number[],
  table: (number | null)[][]
): number | null {
  // For each altitude row, interpolate along weight to get a single value
  const weightInterpolated: (number | null)[] = altitudes.map((_, altIdx) =>
    interpWeight(w, weights, table[altIdx])
  )

  // Then interpolate along altitude
  return interpAltitude(alt, altitudes, weightInterpolated)
}

/**
 * Interpolate from the climb table (1D weight interpolation at a given altitude).
 *
 * Climb table altitudes may not include all cruise altitudes, so we also
 * interpolate between altitude rows.
 *
 * @param alt - Target altitude (ft)
 * @param w - Target weight (lb)
 * @param climbAltitudes - Altitude breakpoints
 * @param climbWeights - Weight breakpoints
 * @param table - 2D data: table[altIdx][wtIdx]
 */
export function interpClimb(
  alt: number,
  w: number,
  climbAltitudes: number[],
  climbWeights: number[],
  table: number[][]
): number {
  const result = interpBilinear(alt, w, climbAltitudes, climbWeights, table)
  return result ?? 0
}
