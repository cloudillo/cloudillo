// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Gradient utilities for canvas applications.
 * Includes type conversion, CSS/SVG generation, and stop manipulation.
 */

import type { Gradient, GradientStop, CompactGradient } from '../types/gradient'

// ============================================================================
// Default Gradients
// ============================================================================

/** Default linear gradient (white to light gray, top to bottom) */
export const DEFAULT_LINEAR_GRADIENT: Gradient = {
	type: 'linear',
	angle: 180,
	stops: [
		{ color: '#ffffff', position: 0 },
		{ color: '#e0e0e0', position: 1 }
	]
}

/** Default radial gradient (white center fading to light gray) */
export const DEFAULT_RADIAL_GRADIENT: Gradient = {
	type: 'radial',
	centerX: 0.5,
	centerY: 0.5,
	stops: [
		{ color: '#ffffff', position: 0 },
		{ color: '#e0e0e0', position: 1 }
	]
}

// ============================================================================
// Type Conversion
// ============================================================================

/**
 * Expand a compact gradient to runtime format.
 * @param compact - Compact CRDT format
 * @returns Runtime gradient or undefined
 */
export function expandGradient(compact: CompactGradient | undefined): Gradient | undefined {
	if (!compact) return undefined

	// Determine type from gt field
	const type = compact.gt === 'l' ? 'linear' : compact.gt === 'r' ? 'radial' : 'solid'

	const gradient: Gradient = { type }

	if (type === 'linear') {
		gradient.angle = compact.ga ?? 180
		gradient.stops = compact.gs?.map(([color, position]) => ({ color, position })) ?? []
	} else if (type === 'radial') {
		gradient.centerX = compact.gx ?? 0.5
		gradient.centerY = compact.gy ?? 0.5
		gradient.stops = compact.gs?.map(([color, position]) => ({ color, position })) ?? []
	}

	return gradient
}

/**
 * Compact a runtime gradient for CRDT storage.
 * @param gradient - Runtime gradient
 * @returns Compact format or undefined
 */
export function compactGradient(gradient: Gradient | undefined): CompactGradient | undefined {
	if (!gradient) return undefined

	// Solid color doesn't need gradient storage
	if (gradient.type === 'solid') {
		return undefined
	}

	const compact: CompactGradient = {
		gt: gradient.type === 'linear' ? 'l' : 'r'
	}

	if (gradient.type === 'linear') {
		if (gradient.angle !== undefined && gradient.angle !== 180) {
			compact.ga = gradient.angle
		}
	} else if (gradient.type === 'radial') {
		if (gradient.centerX !== undefined && gradient.centerX !== 0.5) {
			compact.gx = gradient.centerX
		}
		if (gradient.centerY !== undefined && gradient.centerY !== 0.5) {
			compact.gy = gradient.centerY
		}
	}

	if (gradient.stops && gradient.stops.length > 0) {
		compact.gs = gradient.stops.map((s) => [s.color, s.position])
	}

	return compact
}

// ============================================================================
// CSS Generation
// ============================================================================

/**
 * Convert a gradient to a CSS gradient string.
 * @param gradient - The gradient definition
 * @returns CSS gradient value (e.g., 'linear-gradient(180deg, #fff 0%, #000 100%)')
 */
export function gradientToCSS(gradient: Gradient): string {
	if (gradient.type === 'solid') {
		return gradient.color || '#ffffff'
	}

	const stops = gradient.stops || []
	if (stops.length === 0) {
		return '#ffffff'
	}

	const sortedStops = [...stops].sort((a, b) => a.position - b.position)
	const stopsCSS = sortedStops
		.map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
		.join(', ')

	if (gradient.type === 'linear') {
		const angle = gradient.angle ?? 180
		return `linear-gradient(${angle}deg, ${stopsCSS})`
	}

	if (gradient.type === 'radial') {
		const cx = Math.round((gradient.centerX ?? 0.5) * 100)
		const cy = Math.round((gradient.centerY ?? 0.5) * 100)
		return `radial-gradient(circle at ${cx}% ${cy}%, ${stopsCSS})`
	}

	return '#ffffff'
}

// ============================================================================
// SVG Gradient Generation
// ============================================================================

/** SVG gradient stop definition */
export interface SVGGradientStop {
	offset: string
	stopColor: string
}

/** Linear gradient definition for SVG */
export interface LinearGradientDef {
	x1: string
	y1: string
	x2: string
	y2: string
	stops: SVGGradientStop[]
}

/** Radial gradient definition for SVG */
export interface RadialGradientDef {
	cx: string
	cy: string
	r: string
	stops: SVGGradientStop[]
}

/**
 * Convert angle to SVG linear gradient coordinates.
 * SVG uses x1,y1 to x2,y2 format.
 */
function angleToSVGCoords(angle: number): { x1: string; y1: string; x2: string; y2: string } {
	// Normalize angle to 0-360
	const normalizedAngle = ((angle % 360) + 360) % 360

	// Convert to radians (CSS angles: 0° = to top, 90° = to right)
	// SVG default: 0° = left to right
	// We need to convert CSS convention to SVG coordinates
	const radians = ((normalizedAngle - 90) * Math.PI) / 180

	// Calculate direction vector
	const dx = Math.cos(radians)
	const dy = Math.sin(radians)

	// Convert to percentage coordinates (0% to 100%)
	// Start from center, extend to edges
	const x1 = Math.round((0.5 - dx * 0.5) * 100)
	const y1 = Math.round((0.5 - dy * 0.5) * 100)
	const x2 = Math.round((0.5 + dx * 0.5) * 100)
	const y2 = Math.round((0.5 + dy * 0.5) * 100)

	return {
		x1: `${x1}%`,
		y1: `${y1}%`,
		x2: `${x2}%`,
		y2: `${y2}%`
	}
}

/**
 * Create SVG linear gradient definition.
 * @param angle - Gradient angle in degrees (CSS convention: 0 = up, 90 = right)
 * @param stops - Color stops
 * @returns SVG linearGradient attributes
 */
export function createLinearGradientDef(angle: number, stops: GradientStop[]): LinearGradientDef {
	const coords = angleToSVGCoords(angle)
	const sortedStops = [...stops].sort((a, b) => a.position - b.position)

	return {
		...coords,
		stops: sortedStops.map((s) => ({
			offset: `${Math.round(s.position * 100)}%`,
			stopColor: s.color
		}))
	}
}

/**
 * Create SVG radial gradient definition.
 * @param centerX - Center X position (0-1)
 * @param centerY - Center Y position (0-1)
 * @param stops - Color stops
 * @returns SVG radialGradient attributes
 */
export function createRadialGradientDef(
	centerX: number,
	centerY: number,
	stops: GradientStop[]
): RadialGradientDef {
	const sortedStops = [...stops].sort((a, b) => a.position - b.position)

	return {
		cx: `${Math.round(centerX * 100)}%`,
		cy: `${Math.round(centerY * 100)}%`,
		r: '70.71%', // sqrt(2)/2 * 100% to ensure coverage of corners
		stops: sortedStops.map((s) => ({
			offset: `${Math.round(s.position * 100)}%`,
			stopColor: s.color
		}))
	}
}

// ============================================================================
// Stop Manipulation
// ============================================================================

/**
 * Add a new color stop to a gradient.
 * @param stops - Current stops
 * @param position - Position for new stop (0-1)
 * @param color - Optional color (defaults to interpolated color at position)
 * @returns New stops array with added stop
 */
export function addStop(stops: GradientStop[], position: number, color?: string): GradientStop[] {
	const newColor = color ?? getColorAtPosition(stops, position)
	const newStop: GradientStop = { color: newColor, position }
	return sortStops([...stops, newStop])
}

/**
 * Remove a color stop from a gradient.
 * @param stops - Current stops
 * @param index - Index of stop to remove
 * @returns New stops array without the removed stop
 */
export function removeStop(stops: GradientStop[], index: number): GradientStop[] {
	if (stops.length <= 2) {
		// Don't allow fewer than 2 stops
		return stops
	}
	return stops.filter((_, i) => i !== index)
}

/**
 * Update a color stop.
 * @param stops - Current stops
 * @param index - Index of stop to update
 * @param updates - Partial stop updates
 * @returns New stops array with updated stop
 */
export function updateStop(
	stops: GradientStop[],
	index: number,
	updates: Partial<GradientStop>
): GradientStop[] {
	return stops.map((stop, i) => (i === index ? { ...stop, ...updates } : stop))
}

/**
 * Sort stops by position.
 * @param stops - Stops to sort
 * @returns Sorted stops array
 */
export function sortStops(stops: GradientStop[]): GradientStop[] {
	return [...stops].sort((a, b) => a.position - b.position)
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Parse a hex color to RGB components.
 * @param hex - Hex color string (e.g., '#ff0000' or '#f00')
 * @returns RGB values (0-255)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
	// Remove # if present
	const h = hex.replace(/^#/, '')

	// Handle short format
	const fullHex =
		h.length === 3
			? h
					.split('')
					.map((c) => c + c)
					.join('')
			: h

	const num = parseInt(fullHex, 16)
	return {
		r: (num >> 16) & 255,
		g: (num >> 8) & 255,
		b: num & 255
	}
}

/**
 * Convert RGB to hex color.
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns Hex color string
 */
function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) =>
		Math.round(Math.max(0, Math.min(255, n)))
			.toString(16)
			.padStart(2, '0')
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Interpolate between two colors.
 * @param color1 - Start color (hex)
 * @param color2 - End color (hex)
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated color (hex)
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
	const c1 = hexToRgb(color1)
	const c2 = hexToRgb(color2)

	const r = c1.r + (c2.r - c1.r) * t
	const g = c1.g + (c2.g - c1.g) * t
	const b = c1.b + (c2.b - c1.b) * t

	return rgbToHex(r, g, b)
}

/**
 * Get the interpolated color at a specific position in a gradient.
 * @param stops - Gradient stops
 * @param position - Position (0-1)
 * @returns Interpolated color (hex)
 */
export function getColorAtPosition(stops: GradientStop[], position: number): string {
	if (stops.length === 0) return '#ffffff'
	if (stops.length === 1) return stops[0].color

	const sorted = sortStops(stops)

	// Before first stop
	if (position <= sorted[0].position) {
		return sorted[0].color
	}

	// After last stop
	if (position >= sorted[sorted.length - 1].position) {
		return sorted[sorted.length - 1].color
	}

	// Find the two stops to interpolate between
	for (let i = 0; i < sorted.length - 1; i++) {
		const current = sorted[i]
		const next = sorted[i + 1]

		if (position >= current.position && position <= next.position) {
			const range = next.position - current.position
			const t = range > 0 ? (position - current.position) / range : 0
			return interpolateColor(current.color, next.color, t)
		}
	}

	return '#ffffff'
}

/**
 * Reverse the gradient stops (flip direction).
 * @param stops - Current stops
 * @returns Reversed stops
 */
export function reverseStops(stops: GradientStop[]): GradientStop[] {
	return stops
		.map((stop) => ({
			...stop,
			position: 1 - stop.position
		}))
		.reverse()
}

// vim: ts=4
