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
 * PaletteEditor - Component for editing the presentation's color palette
 */

import * as React from 'react'
import * as Y from 'yjs'
import { ColorInput, PropertySection, PropertyField } from '@cloudillo/react'
import { GradientPicker } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'

import type {
	YPrezilloDocument,
	Palette,
	PaletteColorSlotName,
	PaletteGradientSlotName
} from '../../crdt'
import {
	getPaletteUsageCounts,
	updatePaletteColorSlot,
	updatePaletteGradientSlot,
	getSlotDisplayName,
	COLOR_SLOT_NAMES,
	GRADIENT_SLOT_NAMES,
	DEFAULT_PALETTE
} from '../../crdt'
import { usePaletteValue } from '../../hooks'
import { getContrastColor } from '../../crdt/color-utils'

/**
 * Get a valid gradient for a slot, falling back to default if undefined or solid
 */
function getValidGradient(
	gradient: Gradient | undefined,
	slotName: PaletteGradientSlotName
): Gradient {
	// If gradient exists and is not solid, use it
	if (gradient && gradient.type !== 'solid') {
		return gradient
	}
	// Fall back to default palette gradient
	return DEFAULT_PALETTE[slotName] as Gradient
}

/**
 * Ensure gradient is not solid (convert to linear if needed)
 */
function ensureNotSolid(gradient: Gradient): Gradient {
	if (gradient.type === 'solid') {
		// Convert solid to a simple linear gradient using the solid color
		const color = gradient.color ?? '#cccccc'
		return {
			type: 'linear',
			angle: 180,
			stops: [
				{ color, position: 0 },
				{ color, position: 1 }
			]
		}
	}
	return gradient
}

import './PaletteEditor.css'

export interface PaletteEditorProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	/** Show as expanded section or modal */
	mode?: 'section' | 'modal'
	/** Called when editor should close (modal mode) */
	onClose?: () => void
	/** Class name */
	className?: string
}

/**
 * Editor for the document's color palette
 * Allows editing of color slots and gradient slots
 */
export function PaletteEditor({
	doc,
	yDoc,
	mode = 'section',
	onClose,
	className = ''
}: PaletteEditorProps) {
	const palette = usePaletteValue(doc)
	const usageCounts = React.useMemo(() => getPaletteUsageCounts(doc), [doc])

	// Track which slot is being edited
	const [editingSlot, setEditingSlot] = React.useState<string | null>(null)

	// Handle color slot change
	const handleColorChange = React.useCallback(
		(slotName: PaletteColorSlotName, color: string) => {
			updatePaletteColorSlot(yDoc, doc, slotName, color)
		},
		[yDoc, doc]
	)

	// Handle gradient slot change (ensure not solid)
	const handleGradientChange = React.useCallback(
		(slotName: PaletteGradientSlotName, gradient: Gradient) => {
			// Convert solid to linear if needed
			const validGradient = ensureNotSolid(gradient)
			updatePaletteGradientSlot(yDoc, doc, slotName, validGradient)
		},
		[yDoc, doc]
	)

	// Reset palette to default
	const handleResetToDefault = React.useCallback(() => {
		// Reset each color slot
		COLOR_SLOT_NAMES.forEach((slotName) => {
			const defaultColor = DEFAULT_PALETTE[slotName]
			if (defaultColor) {
				updatePaletteColorSlot(yDoc, doc, slotName, defaultColor.color)
			}
		})
		// Reset each gradient slot
		GRADIENT_SLOT_NAMES.forEach((slotName) => {
			const defaultGradient = DEFAULT_PALETTE[slotName]
			if (defaultGradient) {
				updatePaletteGradientSlot(yDoc, doc, slotName, defaultGradient)
			}
		})
	}, [yDoc, doc])

	const content = (
		<div className={`c-palette-editor ${className}`}>
			{/* Color slots */}
			<div className="c-palette-editor-section">
				<div className="c-palette-editor-section-title">Colors</div>
				<div className="c-palette-editor-grid">
					{COLOR_SLOT_NAMES.map((slotName) => {
						const color = palette[slotName]?.color ?? '#cccccc'
						const count = usageCounts[slotName] ?? 0
						const contrastColor = getContrastColor(color)

						return (
							<div key={slotName} className="c-palette-editor-slot">
								<div className="c-palette-editor-slot-header">
									<span className="c-palette-editor-slot-name">
										{getSlotDisplayName(slotName)}
									</span>
									{count > 0 && (
										<span className="c-palette-editor-slot-count">{count}</span>
									)}
								</div>
								<ColorInput
									value={color}
									onChange={(newColor) => handleColorChange(slotName, newColor)}
									showHex={true}
								/>
							</div>
						)
					})}
				</div>
			</div>

			{/* Gradient slots */}
			<div className="c-palette-editor-section">
				<div className="c-palette-editor-section-title">Gradients</div>
				<div className="c-palette-editor-grid c-palette-editor-grid--gradients">
					{GRADIENT_SLOT_NAMES.map((slotName) => {
						// Get valid gradient (fallback to default if undefined/solid)
						const gradient = getValidGradient(palette[slotName], slotName)
						const count = usageCounts[slotName] ?? 0

						return (
							<div
								key={slotName}
								className="c-palette-editor-slot c-palette-editor-slot--gradient"
							>
								<div className="c-palette-editor-slot-header">
									<span className="c-palette-editor-slot-name">
										{getSlotDisplayName(slotName)}
									</span>
									{count > 0 && (
										<span className="c-palette-editor-slot-count">{count}</span>
									)}
								</div>
								<GradientPicker
									value={gradient}
									onChange={(newGradient) =>
										handleGradientChange(slotName, newGradient)
									}
									showPresets={false}
								/>
							</div>
						)
					})}
				</div>
			</div>

			{/* Actions */}
			<div className="c-palette-editor-actions">
				<button
					type="button"
					className="c-palette-editor-reset"
					onClick={handleResetToDefault}
				>
					Reset to Default
				</button>
			</div>
		</div>
	)

	if (mode === 'section') {
		return (
			<PropertySection title="Palette" defaultExpanded={true}>
				{content}
			</PropertySection>
		)
	}

	// Modal mode
	return (
		<div className="c-palette-editor-modal-backdrop" onClick={onClose}>
			<div className="c-palette-editor-modal" onClick={(e) => e.stopPropagation()}>
				<div className="c-palette-editor-modal-header">
					<h2>Edit Palette</h2>
					<button
						type="button"
						className="c-palette-editor-modal-close"
						onClick={onClose}
					>
						&times;
					</button>
				</div>
				{content}
			</div>
		</div>
	)
}

// vim: ts=4
