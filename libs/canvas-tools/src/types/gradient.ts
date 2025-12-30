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
 * Gradient types for canvas applications.
 * These types define the runtime (expanded) and CRDT-optimized (compact) formats.
 */

/** Gradient type: solid color, linear gradient, or radial gradient */
export type GradientType = 'solid' | 'linear' | 'radial'

/** A single color stop in a gradient */
export interface GradientStop {
	/** Hex color value (e.g., '#ff0000') */
	color: string
	/** Position of the stop (0-1) */
	position: number
}

/** Runtime gradient definition (expanded, human-readable) */
export interface Gradient {
	/** Type of gradient */
	type: GradientType
	/** Solid color (used when type is 'solid') */
	color?: string
	/** Angle in degrees for linear gradients (0-360, 0 = right, 90 = up) */
	angle?: number
	/** Center X position for radial gradients (0-1) */
	centerX?: number
	/** Center Y position for radial gradients (0-1) */
	centerY?: number
	/** Color stops for linear/radial gradients */
	stops?: GradientStop[]
}

/**
 * Compact gradient format optimized for CRDT storage.
 * Uses short field names to minimize storage size.
 */
export interface CompactGradient {
	/** Gradient type: 'l' = linear, 'r' = radial (omit for solid) */
	gt?: 'l' | 'r'
	/** Gradient angle (linear only) */
	ga?: number
	/** Center X (radial only) */
	gx?: number
	/** Center Y (radial only) */
	gy?: number
	/** Stops as [color, position] tuples */
	gs?: Array<[string, number]>
}

/** Preset gradient category */
export type GradientPresetCategory = 'light' | 'dark' | 'vibrant' | 'pastel' | 'nature'

/** A predefined gradient preset */
export interface GradientPreset {
	/** Unique preset identifier */
	id: string
	/** Human-readable name */
	name: string
	/** Category for grouping */
	category: GradientPresetCategory
	/** The gradient definition */
	gradient: Gradient
}

// vim: ts=4
