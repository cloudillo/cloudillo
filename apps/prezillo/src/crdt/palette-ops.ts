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
 * Palette operations for the prezillo presentation app
 */

import * as Y from 'yjs'
import type { Gradient } from '@cloudillo/canvas-tools'

import type {
	YPrezilloDocument,
	StoredPalette,
	StoredPaletteRef,
	PaletteSlot
} from './stored-types'
import type {
	Palette,
	PaletteRef,
	PaletteSlotName,
	PaletteColorSlotName,
	PaletteGradientSlotName,
	PaletteColor,
	ResolvedColorValue
} from './runtime-types'
import { expandPalette, compactPalette, expandPaletteRef, isPaletteRef } from './type-converters'
import { applyTint, applyTintToGradient } from './color-utils'
import type { PalettePreset } from './palette-presets'

// Palette slot reverse mapping for finding objects
const PALETTE_SLOT_REVERSE: Record<PaletteSlotName, PaletteSlot> = {
	background: 'bg',
	text: 'tx',
	accent1: 'a1',
	accent2: 'a2',
	accent3: 'a3',
	accent4: 'a4',
	accent5: 'a5',
	accent6: 'a6',
	gradient1: 'g1',
	gradient2: 'g2',
	gradient3: 'g3',
	gradient4: 'g4'
}

/**
 * Default palette (like PowerPoint "Office" theme)
 */
export const DEFAULT_PALETTE: Palette = {
	name: 'Default',
	background: { color: '#ffffff' },
	text: { color: '#333333' },
	accent1: { color: '#4a90d9' }, // Blue
	accent2: { color: '#5cb85c' }, // Green
	accent3: { color: '#f0ad4e' }, // Orange
	accent4: { color: '#d9534f' }, // Red
	accent5: { color: '#9b59b6' }, // Purple
	accent6: { color: '#1abc9c' }, // Teal
	gradient1: {
		type: 'linear',
		angle: 180,
		stops: [
			{ color: '#4a90d9', position: 0 },
			{ color: '#2d5a87', position: 1 }
		]
	},
	gradient2: {
		type: 'linear',
		angle: 135,
		stops: [
			{ color: '#5cb85c', position: 0 },
			{ color: '#3d8b3d', position: 1 }
		]
	},
	gradient3: {
		type: 'radial',
		centerX: 0.5,
		centerY: 0.5,
		stops: [
			{ color: '#f0ad4e', position: 0 },
			{ color: '#c87f0a', position: 1 }
		]
	},
	gradient4: {
		type: 'linear',
		angle: 90,
		stops: [
			{ color: '#667eea', position: 0 },
			{ color: '#764ba2', position: 1 }
		]
	}
}

/**
 * Get the document's palette (or default if not set)
 */
export function getPalette(doc: YPrezilloDocument): Palette {
	const stored = doc.pl?.get('default') as StoredPalette | undefined
	if (!stored) return DEFAULT_PALETTE
	return expandPalette(stored)
}

/**
 * Set the document's palette
 */
export function setPalette(yDoc: Y.Doc, doc: YPrezilloDocument, palette: Palette): void {
	yDoc.transact(() => {
		doc.pl.set('default', compactPalette(palette))
	}, yDoc.clientID)
}

/**
 * Update a single color slot in the palette
 */
export function updatePaletteColorSlot(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	slot: PaletteColorSlotName,
	color: string
): void {
	const palette = getPalette(doc)
	const updated: Palette = {
		...palette,
		[slot]: { color }
	}
	setPalette(yDoc, doc, updated)
}

/**
 * Update a single gradient slot in the palette
 */
export function updatePaletteGradientSlot(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	slot: PaletteGradientSlotName,
	gradient: Gradient
): void {
	const palette = getPalette(doc)
	const updated: Palette = {
		...palette,
		[slot]: gradient
	}
	setPalette(yDoc, doc, updated)
}

/**
 * Update the palette name
 */
export function updatePaletteName(yDoc: Y.Doc, doc: YPrezilloDocument, name: string): void {
	const palette = getPalette(doc)
	setPalette(yDoc, doc, { ...palette, name })
}

/**
 * Apply a preset palette to the document
 * This replaces the entire palette with the preset's colors and gradients
 */
export function applyPreset(yDoc: Y.Doc, doc: YPrezilloDocument, preset: PalettePreset): void {
	setPalette(yDoc, doc, { ...preset.palette })
}

/**
 * Reset palette to default
 */
export function resetPaletteToDefault(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	setPalette(yDoc, doc, { ...DEFAULT_PALETTE })
}

/**
 * Check if a slot is a gradient slot
 */
export function isGradientSlot(slot: PaletteSlotName): slot is PaletteGradientSlotName {
	return slot.startsWith('gradient')
}

/**
 * Get the color/gradient from a palette slot
 */
export function getPaletteSlotValue(
	palette: Palette,
	slot: PaletteSlotName
): PaletteColor | Gradient | undefined {
	return palette[slot as keyof Palette] as PaletteColor | Gradient | undefined
}

/**
 * Resolve a palette reference to an actual color/gradient value
 */
export function resolvePaletteRef(palette: Palette, ref: PaletteRef): ResolvedColorValue {
	const slot = ref.slotId
	const opacity = ref.opacity ?? 1
	const tint = ref.tint ?? 0

	// Check if it's a gradient slot
	if (isGradientSlot(slot)) {
		const gradient = palette[slot]
		if (gradient) {
			// Apply tint to gradient stops if needed
			const adjustedGradient = tint !== 0 ? applyTintToGradient(gradient, tint) : gradient
			return {
				type: 'gradient',
				gradient: adjustedGradient,
				opacity,
				isPaletteRef: true,
				paletteSlot: slot
			}
		}
	} else {
		// Color slot
		const colorEntry = palette[slot as PaletteColorSlotName]
		if (colorEntry) {
			let color = colorEntry.color
			// Apply tint/shade
			if (tint !== 0) {
				color = applyTint(color, tint)
			}
			return {
				type: 'solid',
				color,
				opacity,
				isPaletteRef: true,
				paletteSlot: slot
			}
		}
	}

	// Fallback if slot not found
	return {
		type: 'solid',
		color: '#cccccc',
		opacity: 1,
		isPaletteRef: false
	}
}

/**
 * Resolve any color value (string or palette ref) to final value
 */
export function resolveColorValue(
	palette: Palette,
	value: string | StoredPaletteRef | undefined,
	defaultColor: string = '#cccccc'
): ResolvedColorValue {
	if (value === undefined) {
		return {
			type: 'solid',
			color: defaultColor,
			opacity: 1,
			isPaletteRef: false
		}
	}

	if (typeof value === 'string') {
		return {
			type: 'solid',
			color: value,
			opacity: 1,
			isPaletteRef: false
		}
	}

	// Palette reference
	return resolvePaletteRef(palette, expandPaletteRef(value))
}

/**
 * Get the resolved color string from a color value
 * This is a convenience function for simple cases where you just need the color
 */
export function getResolvedColor(
	palette: Palette,
	value: string | StoredPaletteRef | undefined,
	defaultColor: string = '#cccccc'
): string {
	const resolved = resolveColorValue(palette, value, defaultColor)
	return resolved.color ?? defaultColor
}

/**
 * Find all objects using a specific palette slot
 */
export function getObjectsUsingPaletteSlot(
	doc: YPrezilloDocument,
	slot: PaletteSlotName
): string[] {
	const slotCode = PALETTE_SLOT_REVERSE[slot]
	const objectIds: string[] = []

	doc.o.forEach((obj, id) => {
		let usesSlot = false

		// Check inline shape style
		if (obj.s) {
			if (isPaletteRef(obj.s.f) && obj.s.f.pi === slotCode) usesSlot = true
			if (isPaletteRef(obj.s.s) && obj.s.s.pi === slotCode) usesSlot = true
			// Check shadow color
			if (obj.s.sh && isPaletteRef(obj.s.sh[3]) && obj.s.sh[3].pi === slotCode)
				usesSlot = true
		}

		// Check shape style overrides
		if (obj.so) {
			if (isPaletteRef(obj.so.f) && obj.so.f.pi === slotCode) usesSlot = true
			if (isPaletteRef(obj.so.s) && obj.so.s.pi === slotCode) usesSlot = true
		}

		// Check inline text style
		if (obj.ts && isPaletteRef(obj.ts.fc) && obj.ts.fc.pi === slotCode) usesSlot = true

		// Check text style overrides
		if (obj.to && isPaletteRef(obj.to.fc) && obj.to.fc.pi === slotCode) usesSlot = true

		if (usesSlot && !objectIds.includes(id)) {
			objectIds.push(id)
		}
	})

	return objectIds
}

/**
 * Count objects using each palette slot
 */
export function getPaletteUsageCounts(doc: YPrezilloDocument): Record<PaletteSlotName, number> {
	const counts: Record<PaletteSlotName, number> = {
		background: 0,
		text: 0,
		accent1: 0,
		accent2: 0,
		accent3: 0,
		accent4: 0,
		accent5: 0,
		accent6: 0,
		gradient1: 0,
		gradient2: 0,
		gradient3: 0,
		gradient4: 0
	}

	const slots = Object.keys(counts) as PaletteSlotName[]
	for (const slot of slots) {
		counts[slot] = getObjectsUsingPaletteSlot(doc, slot).length
	}

	return counts
}

/**
 * Create a palette reference for a slot
 */
export function createPaletteRef(
	slot: PaletteSlotName,
	opacity?: number,
	tint?: number
): StoredPaletteRef {
	const ref: StoredPaletteRef = {
		pi: PALETTE_SLOT_REVERSE[slot]
	}
	if (opacity !== undefined && opacity !== 1) {
		ref.o = opacity
	}
	if (tint !== undefined && tint !== 0) {
		ref.t = tint
	}
	return ref
}

/**
 * Get display name for a palette slot
 */
export function getPaletteSlotDisplayName(slot: PaletteSlotName): string {
	const names: Record<PaletteSlotName, string> = {
		background: 'Background',
		text: 'Text',
		accent1: 'Accent 1',
		accent2: 'Accent 2',
		accent3: 'Accent 3',
		accent4: 'Accent 4',
		accent5: 'Accent 5',
		accent6: 'Accent 6',
		gradient1: 'Gradient 1',
		gradient2: 'Gradient 2',
		gradient3: 'Gradient 3',
		gradient4: 'Gradient 4'
	}
	return names[slot]
}

// Alias for convenience
export const getSlotDisplayName = getPaletteSlotDisplayName

/**
 * Color slot names constant
 */
export const COLOR_SLOT_NAMES: readonly PaletteColorSlotName[] = [
	'background',
	'text',
	'accent1',
	'accent2',
	'accent3',
	'accent4',
	'accent5',
	'accent6'
] as const

/**
 * Gradient slot names constant
 */
export const GRADIENT_SLOT_NAMES: readonly PaletteGradientSlotName[] = [
	'gradient1',
	'gradient2',
	'gradient3',
	'gradient4'
] as const

/**
 * All slot names constant
 */
export const ALL_SLOT_NAMES: readonly PaletteSlotName[] = [
	...COLOR_SLOT_NAMES,
	...GRADIENT_SLOT_NAMES
] as const

/**
 * Get all color slot names (for iteration)
 */
export function getColorSlotNames(): PaletteColorSlotName[] {
	return [...COLOR_SLOT_NAMES]
}

/**
 * Get all gradient slot names (for iteration)
 */
export function getGradientSlotNames(): PaletteGradientSlotName[] {
	return [...GRADIENT_SLOT_NAMES]
}

/**
 * Get all slot names (for iteration)
 */
export function getAllSlotNames(): PaletteSlotName[] {
	return [...ALL_SLOT_NAMES]
}

// vim: ts=4
