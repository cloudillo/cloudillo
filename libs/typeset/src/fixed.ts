// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Fixed-point length: an integer count of 1/1024 pt. */
export type Fx = number

/** Fx units per point. */
export const FX = 1024

/** Points → Fx. The single rounding point for user-entered lengths. */
export function ptToFx(pt: number): Fx {
	return Math.round(pt * FX)
}

/** Fx → points (for output only; never feed the result back into layout). */
export function fxToPt(fx: Fx): number {
	return fx / FX
}

/**
 * Font units at `size` (Fx) in a font with `upem` units per em → Fx.
 * Integer product first, one `Math.round` at the end. Exact while
 * |units × size| < 2^53 (e.g. 1e6 units at a 1e6 Fx size).
 */
export function unitsToFx(units: number, size: Fx, upem: number): Fx {
	return Math.round((units * size) / upem)
}
