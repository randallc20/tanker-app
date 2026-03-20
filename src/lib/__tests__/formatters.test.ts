import { describe, it, expect } from 'vitest';
import {
  formatFuel,
  formatFuelPrice,
  formatDollars,
  formatFlightTime,
  formatRatio,
  formatDistance,
} from '../formatters';

describe('formatFuel', () => {
  it('whole numbers with commas', () => {
    expect(formatFuel(4200)).toBe('4,200 gal');
  });

  it('rounds to nearest whole number', () => {
    expect(formatFuel(4200.7)).toBe('4,201 gal');
    expect(formatFuel(4200.3)).toBe('4,200 gal');
  });

  it('zero', () => {
    expect(formatFuel(0)).toBe('0 gal');
  });

  it('respects custom unit', () => {
    expect(formatFuel(1000, 'L')).toBe('1,000 L');
  });

  it('large numbers', () => {
    expect(formatFuel(12345)).toBe('12,345 gal');
  });
});

describe('formatFuelPrice', () => {
  it('always 2 decimals', () => {
    expect(formatFuelPrice(5)).toBe('$5.00/gal');
    expect(formatFuelPrice(5.4)).toBe('$5.40/gal');
    expect(formatFuelPrice(5.47)).toBe('$5.47/gal');
    expect(formatFuelPrice(5.479)).toBe('$5.48/gal');
  });

  it('respects custom unit', () => {
    expect(formatFuelPrice(5.47, 'L')).toBe('$5.47/L');
  });
});

describe('formatDollars', () => {
  it('>= $1000: no decimals, comma separated', () => {
    expect(formatDollars(1000)).toBe('$1,000');
    expect(formatDollars(1234.56)).toBe('$1,235');
    expect(formatDollars(25000)).toBe('$25,000');
  });

  it('< $1000: two decimal places', () => {
    expect(formatDollars(999.99)).toBe('$999.99');
    expect(formatDollars(42)).toBe('$42.00');
    expect(formatDollars(0.5)).toBe('$0.50');
    expect(formatDollars(0)).toBe('$0.00');
  });

  it('negative amounts', () => {
    // formatDollars uses Math.abs internally for formatting
    const result = formatDollars(-500);
    expect(result).toContain('500.00');
  });
});

describe('formatFlightTime', () => {
  it('Xh Ym format', () => {
    expect(formatFlightTime(2.5)).toBe('2h 30m');
    expect(formatFlightTime(1.75)).toBe('1h 45m');
  });

  it('whole hours: no minutes shown', () => {
    expect(formatFlightTime(2)).toBe('2h');
  });

  it('less than 1 hour: minutes only', () => {
    expect(formatFlightTime(0.5)).toBe('30m');
  });

  it('zero', () => {
    expect(formatFlightTime(0)).toBe('0m');
  });

  it('rounds to nearest minute', () => {
    // 2.4167 hours = 2h 25m (145 minutes)
    expect(formatFlightTime(145 / 60)).toBe('2h 25m');
  });
});

describe('formatRatio', () => {
  it('formats delivery ratio as percentage with 1 decimal', () => {
    expect(formatRatio(0.937)).toBe('93.7%');
    expect(formatRatio(0.93)).toBe('93.0%');
    expect(formatRatio(1.0)).toBe('100.0%');
  });

  it('handles ratios already in percentage form', () => {
    // The function checks if ratio <= 1 to determine format
    expect(formatRatio(93.7)).toBe('93.7%');
  });
});

describe('formatDistance', () => {
  it('rounded to nearest nm, comma thousands', () => {
    expect(formatDistance(1089)).toBe('1,089 nm');
    expect(formatDistance(1089.4)).toBe('1,089 nm');
    expect(formatDistance(1089.6)).toBe('1,090 nm');
  });

  it('respects custom unit', () => {
    expect(formatDistance(2017, 'km')).toBe('2,017 km');
  });

  it('zero distance', () => {
    expect(formatDistance(0)).toBe('0 nm');
  });
});
