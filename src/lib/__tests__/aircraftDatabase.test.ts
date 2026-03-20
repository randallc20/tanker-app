import { describe, it, expect } from 'vitest';
import { aircraftDatabase } from '../aircraftDatabase';

const cj4 = aircraftDatabase.find(
  a => a.model === 'Citation CJ4' || a.variant === 'CJ4'
)!;

describe('CJ4 entry', () => {
  it('exists in database', () => {
    expect(cj4).toBeDefined();
  });

  it('maxFuelGal = 870', () => {
    expect(cj4.maxFuelGal).toBe(870);
  });

  it('NBAA reserves = 136', () => {
    expect(cj4.reservesNbaaGal).toBe(136);
  });

  it('burn penalty = 2.5 %/hr', () => {
    expect(cj4.burnPenaltyPerHrPct).toBe(2.5);
  });

  it('all confidence tiers are "verified"', () => {
    expect(cj4.confidence.weights).toBe('verified');
    expect(cj4.confidence.fuelCapacity).toBe('verified');
    expect(cj4.confidence.burnRate).toBe('verified');
    expect(cj4.confidence.burnPenalty).toBe('verified');
    expect(cj4.confidence.reserves).toBe('verified');
  });

  it('has non-empty dataSource', () => {
    expect(cj4.dataSource.length).toBeGreaterThan(0);
  });
});

describe('all non-CJ4 entries', () => {
  const nonCj4 = aircraftDatabase.filter(
    a => a.model !== 'Citation CJ4' && a.variant !== 'CJ4'
  );

  it('do NOT have all confidence fields = "verified"', () => {
    for (const entry of nonCj4) {
      const allVerified =
        entry.confidence.weights === 'verified' &&
        entry.confidence.fuelCapacity === 'verified' &&
        entry.confidence.burnRate === 'verified' &&
        entry.confidence.burnPenalty === 'verified' &&
        entry.confidence.reserves === 'verified';
      expect(allVerified).toBe(false);
    }
  });
});

describe('all database entries', () => {
  it('have non-empty dataSource', () => {
    for (const entry of aircraftDatabase) {
      expect(entry.dataSource.length).toBeGreaterThan(0);
    }
  });

  it('no entry has burnPenalty = "verified" unless it is the CJ4 (which has proper derivation)', () => {
    for (const entry of aircraftDatabase) {
      if (entry.confidence.burnPenalty === 'verified') {
        // Only the CJ4 should have verified burn penalty (derived from POH tables)
        const isCj4 = entry.model === 'Citation CJ4' || entry.variant === 'CJ4';
        expect(isCj4).toBe(true);
      }
    }
  });
});
