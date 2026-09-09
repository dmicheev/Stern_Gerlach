/** Visual scale helpers (physics in SI meters, scene unit = 1 mm). */
export const M_TO_UNITS = 1000

/** adaptive z-range of the detector histogram / screen plane */
export const Z_RANGE_MIN = 80 // mm
export const Z_RANGE_MAX = 400 // mm
const Z_RANGE_STEP = 20 // mm

/** quantize the observed max |z| (mm) into a stable axis range */
export function adaptiveZRangeMm(maxAbsMm: number): number {
  const padded = maxAbsMm * 1.08
  const q = Math.ceil(padded / Z_RANGE_STEP) * Z_RANGE_STEP
  return Math.max(Z_RANGE_MIN, Math.min(Z_RANGE_MAX, q))
}
