import { describe, it, expect } from 'vitest';
import {
  GAL_TO_L,
  NM_TO_KM,
  LBS_TO_KG,
  L_TO_GAL,
  KM_TO_NM,
  KG_TO_LBS,
  JET_A_DENSITY_LBS_PER_GAL,
  JET_A_CO2_KG_PER_GAL,
  galToL,
  lToGal,
  nmToKm,
  kmToNm,
  lbsToKg,
  kgToLbs,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
} from '../units';

describe('unit constants', () => {
  it('GAL_TO_L = 3.78541', () => {
    expect(GAL_TO_L).toBe(3.78541);
  });

  it('NM_TO_KM = 1.852', () => {
    expect(NM_TO_KM).toBe(1.852);
  });

  it('LBS_TO_KG = 0.453592', () => {
    expect(LBS_TO_KG).toBe(0.453592);
  });

  it('L_TO_GAL is exact inverse of GAL_TO_L', () => {
    expect(L_TO_GAL).toBeCloseTo(1 / GAL_TO_L, 12);
  });

  it('KM_TO_NM is exact inverse of NM_TO_KM', () => {
    expect(KM_TO_NM).toBeCloseTo(1 / NM_TO_KM, 12);
  });

  it('KG_TO_LBS is exact inverse of LBS_TO_KG', () => {
    expect(KG_TO_LBS).toBeCloseTo(1 / LBS_TO_KG, 12);
  });

  it('JET_A_DENSITY_LBS_PER_GAL = 6.7', () => {
    expect(JET_A_DENSITY_LBS_PER_GAL).toBe(6.7);
  });

  it('JET_A_CO2_KG_PER_GAL = 9.57 (ICAO standard)', () => {
    expect(JET_A_CO2_KG_PER_GAL).toBe(9.57);
  });
});

describe('round-trip conversions: gal <-> L', () => {
  it('gal -> L -> gal returns original', () => {
    const original = 870;
    expect(lToGal(galToL(original))).toBeCloseTo(original, 8);
  });

  it('L -> gal -> L returns original', () => {
    const original = 3293.5;
    expect(galToL(lToGal(original))).toBeCloseTo(original, 8);
  });
});

describe('round-trip conversions: nm <-> km', () => {
  it('nm -> km -> nm returns original', () => {
    const original = 1089;
    expect(kmToNm(nmToKm(original))).toBeCloseTo(original, 8);
  });

  it('km -> nm -> km returns original', () => {
    const original = 2000;
    expect(nmToKm(kmToNm(original))).toBeCloseTo(original, 8);
  });
});

describe('round-trip conversions: lbs <-> kg', () => {
  it('lbs -> kg -> lbs returns original', () => {
    const original = 17230;
    expect(kgToLbs(lbsToKg(original))).toBeCloseTo(original, 6);
  });

  it('kg -> lbs -> kg returns original', () => {
    const original = 7816;
    expect(lbsToKg(kgToLbs(original))).toBeCloseTo(original, 6);
  });
});

describe('round-trip conversions: Celsius <-> Fahrenheit', () => {
  it('C -> F -> C returns original', () => {
    const original = -56.5;
    expect(fahrenheitToCelsius(celsiusToFahrenheit(original))).toBeCloseTo(original, 8);
  });

  it('F -> C -> F returns original', () => {
    const original = 72;
    expect(celsiusToFahrenheit(fahrenheitToCelsius(original))).toBeCloseTo(original, 8);
  });

  it('0 C = 32 F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });

  it('100 C = 212 F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
});

describe('specific conversion values', () => {
  it('1 gallon = 3.78541 liters', () => {
    expect(galToL(1)).toBe(3.78541);
  });

  it('1 nm = 1.852 km', () => {
    expect(nmToKm(1)).toBe(1.852);
  });

  it('1 lb = 0.453592 kg', () => {
    expect(lbsToKg(1)).toBe(0.453592);
  });
});
