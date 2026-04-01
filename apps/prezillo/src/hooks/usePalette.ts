// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for accessing the document's palette
 */

import * as React from 'react'
import type * as Y from 'yjs'
import { useY } from 'react-yjs'

import type {
	YPrezilloDocument,
	Palette,
	PaletteSlotName,
	PaletteColorSlotName,
	PaletteGradientSlotName
} from '../crdt'
import {
	getPalette,
	setPalette,
	updatePaletteColorSlot,
	updatePaletteGradientSlot,
	updatePaletteName,
	getPaletteUsageCounts
} from '../crdt'
import type { Gradient } from '@cloudillo/canvas-tools'

export interface UsePaletteReturn {
	/** The current palette */
	palette: Palette
	/** Update the entire palette */
	setPalette: (palette: Palette) => void
	/** Update a single color slot */
	updateColorSlot: (slot: PaletteColorSlotName, color: string) => void
	/** Update a single gradient slot */
	updateGradientSlot: (slot: PaletteGradientSlotName, gradient: Gradient) => void
	/** Update the palette name */
	updateName: (name: string) => void
	/** Get usage counts for all slots */
	getUsageCounts: () => Record<PaletteSlotName, number>
}

/**
 * Get the document's palette with reactive updates
 */
export function usePalette(doc: YPrezilloDocument, yDoc: Y.Doc): UsePaletteReturn {
	const paletteMap = useY(doc.pl)

	const palette = React.useMemo(() => {
		// Trigger recalculation when paletteMap changes
		if (!paletteMap) return getPalette(doc)
		return getPalette(doc)
	}, [doc, paletteMap])

	const handlers = React.useMemo(
		() => ({
			setPalette: (newPalette: Palette) => {
				setPalette(yDoc, doc, newPalette)
			},
			updateColorSlot: (slot: PaletteColorSlotName, color: string) => {
				updatePaletteColorSlot(yDoc, doc, slot, color)
			},
			updateGradientSlot: (slot: PaletteGradientSlotName, gradient: Gradient) => {
				updatePaletteGradientSlot(yDoc, doc, slot, gradient)
			},
			updateName: (name: string) => {
				updatePaletteName(yDoc, doc, name)
			},
			getUsageCounts: () => getPaletteUsageCounts(doc)
		}),
		[yDoc, doc]
	)

	return {
		palette,
		...handlers
	}
}

/**
 * Get just the palette value (read-only, no update functions)
 */
export function usePaletteValue(doc: YPrezilloDocument): Palette {
	const paletteMap = useY(doc.pl)

	return React.useMemo(() => {
		if (!paletteMap) return getPalette(doc)
		return getPalette(doc)
	}, [doc, paletteMap])
}

// vim: ts=4
