/**
 * Aircraft Registry
 *
 * Central registry of all available aircraft performance datasets.
 * The CJ4 is the first entry. Additional aircraft are added here
 * as their flight planning guide data is extracted.
 */

import { AircraftPerformanceData } from './types'
import { cj4 } from './cj4_525c'

/** All available aircraft, keyed by ID */
const registry: Record<string, AircraftPerformanceData> = {
  cj4_525c: cj4,
}

/** Get aircraft by ID. Returns undefined if not found. */
export function getAircraft(id: string): AircraftPerformanceData | undefined {
  return registry[id]
}

/** Get list of all available aircraft for selector UI */
export function listAircraft(): { id: string; displayName: string; dataSource: string }[] {
  return Object.values(registry).map(a => ({
    id: a.id,
    displayName: a.displayName,
    dataSource: a.dataSource,
  }))
}

/**
 * Register a new aircraft dataset at runtime.
 * Used by future document ingestion pipeline.
 *
 * @param data - Validated AircraftPerformanceData object
 * @throws if an aircraft with the same ID already exists
 */
export function registerAircraft(data: AircraftPerformanceData): void {
  if (registry[data.id]) {
    throw new Error(`Aircraft "${data.id}" is already registered`)
  }
  registry[data.id] = data
}

// ─── FUTURE: Document Ingestion Pipeline ────────────────────────────────────
//
// TODO: implement document ingestion
//
// The pipeline will:
// 1. Accept a PDF upload (Flight Planning Guide or POH)
// 2. Extract performance tables using pdfplumber (Python) or PDF.js (browser)
// 3. Map extracted data to the AircraftPerformanceData schema
// 4. Validate internal consistency:
//    - Fuel flow at heavier weight >= fuel flow at lighter weight (for LRC)
//    - KTAS values within reasonable range for aircraft class
//    - Climb fuel increases monotonically with altitude and weight
// 5. Call registerAircraft() to make it available
//
// Known aircraft that lack cruise data in their AFM:
// - Cessna Citation CJ3 (525B): cruise data in CPCalc software only
// - Most modern Cessna Citations: CPCalc / Electronic Operating Manual
//
// Options for these aircraft:
// - Use manufacturer-provided flight planning guides (like CJ4)
// - Use Breguet equation with published engine TSFC (lower accuracy)
// - Request operator to provide data from CPCalc outputs

// export async function ingestDocument(
//   file: File,
//   aircraftMeta: { id: string; displayName: string; manufacturer: string; model: string }
// ): Promise<AircraftPerformanceData> {
//   // Step 1: Parse PDF tables
//   // Step 2: Identify table types (cruise HSC, cruise LRC, climb, wind)
//   // Step 3: Extract numeric data with column/row headers
//   // Step 4: Map to AircraftPerformanceData schema
//   // Step 5: Validate
//   // Step 6: Return validated data
//   throw new Error('Document ingestion not yet implemented')
// }
