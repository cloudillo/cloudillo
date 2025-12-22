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
 * Floating property bar for selected object styling
 * Appears above selection with stroke/fill color and width controls
 */

import * as React from 'react'
import * as Y from 'yjs'
import { NumberInput } from '@cloudillo/react'

import type { ObjectId, YIdealloDocument, Bounds, Style, IdealloObject } from '../crdt/index.js'
import { getObject, updateObject } from '../crdt/index.js'
import { ColorPalette } from './ColorPalette.js'
import { colorToCss } from '../utils/palette.js'

export interface PropertyBarProps {
	yDoc: Y.Doc
	doc: YIdealloDocument
	selectedIds: Set<ObjectId>
	/** Screen-space bounds of the selection box */
	screenBounds: Bounds | null
	/** Rotation angle of selected object(s) in degrees */
	rotation?: number
	/** Current style for the "default" style when creating new objects */
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	/** Callback to update the current (default) style */
	onCurrentStyleChange?: (
		style: Partial<{
			strokeColor: string
			fillColor: string
			strokeWidth: number
		}>
	) => void
}

// Minimum distance from viewport edges
const VIEWPORT_PADDING = 16
// Height of the property bar (for positioning)
const BAR_HEIGHT = 48
// Gap between selection and property bar
const SELECTION_GAP = 12

type PopoverType = 'stroke' | 'fill' | null

export function PropertyBar({
	yDoc,
	doc,
	selectedIds,
	screenBounds,
	rotation = 0,
	currentStyle,
	onCurrentStyleChange
}: PropertyBarProps) {
	// Popover state
	const [openPopover, setOpenPopover] = React.useState<PopoverType>(null)
	const popoverRef = React.useRef<HTMLDivElement>(null)

	// Close popover when selection changes
	React.useEffect(() => {
		setOpenPopover(null)
	}, [selectedIds])

	// Close popover on outside click
	React.useEffect(() => {
		if (!openPopover) return

		const handleClickOutside = (e: MouseEvent) => {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				setOpenPopover(null)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [openPopover])

	// Get style from first selected object
	const getSelectedStyle = React.useCallback((): Style | null => {
		if (selectedIds.size === 0) return null
		const firstId = Array.from(selectedIds)[0]
		const obj = getObject(doc, firstId)
		return obj?.style ?? null
	}, [doc, selectedIds])

	// Local style state - updated immediately on change, synced from selection
	const [localStyle, setLocalStyle] = React.useState(() => {
		const style = getSelectedStyle()
		if (style) {
			return {
				strokeColor: style.strokeColor,
				fillColor: style.fillColor,
				strokeWidth: style.strokeWidth
			}
		}
		return currentStyle
	})

	// Sync local style when selection changes
	React.useEffect(() => {
		const style = getSelectedStyle()
		if (style) {
			setLocalStyle({
				strokeColor: style.strokeColor,
				fillColor: style.fillColor,
				strokeWidth: style.strokeWidth
			})
		} else {
			setLocalStyle(currentStyle)
		}
	}, [selectedIds, getSelectedStyle, currentStyle])

	// Use local style for display
	const displayStyle = localStyle

	// Has a fill (not transparent/none)
	const hasFill = displayStyle.fillColor !== 'transparent' && displayStyle.fillColor !== 'none'

	// Update all selected objects
	const updateSelectedStyle = React.useCallback(
		(updates: Partial<Style>) => {
			// Update local style immediately for responsive UI
			setLocalStyle((prev) => ({ ...prev, ...updates }))

			selectedIds.forEach((id) => {
				const obj = getObject(doc, id)
				if (obj) {
					updateObject(yDoc, doc, id, {
						style: { ...obj.style, ...updates }
					} as Partial<IdealloObject>)
				}
			})
			// Also update current style for new objects
			onCurrentStyleChange?.(updates as any)
		},
		[yDoc, doc, selectedIds, onCurrentStyleChange]
	)

	// Handle stroke color change
	const handleStrokeColorChange = React.useCallback(
		(color: string) => {
			updateSelectedStyle({ strokeColor: color })
			setOpenPopover(null)
		},
		[updateSelectedStyle]
	)

	// Handle fill color change
	const handleFillColorChange = React.useCallback(
		(color: string) => {
			updateSelectedStyle({ fillColor: color })
			setOpenPopover(null)
		},
		[updateSelectedStyle]
	)

	// Handle stroke width change
	const handleStrokeWidthChange = React.useCallback(
		(width: number) => {
			updateSelectedStyle({ strokeWidth: width })
		},
		[updateSelectedStyle]
	)

	// Calculate position - above or below selection based on rotation handle position
	const position = React.useMemo(() => {
		if (!screenBounds) return null

		// Center horizontally on selection
		const centerX = screenBounds.x + screenBounds.width / 2

		// Normalize rotation to -180 to 180 range
		let normalizedRotation = rotation % 360
		if (normalizedRotation > 180) normalizedRotation -= 360
		if (normalizedRotation < -180) normalizedRotation += 360

		// Rotation handle is at top when rotation is near 0°
		// If |rotation| < 90°, handle is more towards top, so position bar below
		// If |rotation| >= 90°, handle is more towards bottom, so position bar above
		const preferBelow = Math.abs(normalizedRotation) < 90

		let top: number
		if (preferBelow) {
			// Try below first
			top = screenBounds.y + screenBounds.height + SELECTION_GAP
			// If not enough room below, position above
			if (top + BAR_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
				top = screenBounds.y - SELECTION_GAP - BAR_HEIGHT
			}
		} else {
			// Try above first
			top = screenBounds.y - SELECTION_GAP - BAR_HEIGHT
			// If not enough room above, position below
			if (top < VIEWPORT_PADDING) {
				top = screenBounds.y + screenBounds.height + SELECTION_GAP
			}
		}

		return {
			top,
			left: centerX
		}
	}, [screenBounds, rotation])

	// Don't render if nothing selected
	if (selectedIds.size === 0 || !position) return null

	return (
		<div
			className="ideallo-property-bar"
			ref={popoverRef}
			style={{
				top: position.top,
				left: position.left,
				transform: 'translateX(-50%)'
			}}
		>
			{/* Stroke color */}
			<div className="ideallo-property-group">
				<label className="ideallo-property-label">Stroke</label>
				<div className="ideallo-color-picker">
					<button
						type="button"
						className="palette-swatch-btn"
						style={{ backgroundColor: colorToCss(displayStyle.strokeColor) }}
						onClick={() => setOpenPopover(openPopover === 'stroke' ? null : 'stroke')}
					/>
					{openPopover === 'stroke' && (
						<div className="ideallo-color-popover">
							<ColorPalette
								value={displayStyle.strokeColor}
								onChange={handleStrokeColorChange}
							/>
						</div>
					)}
				</div>
			</div>

			<div className="ideallo-property-divider" />

			{/* Fill color */}
			<div className="ideallo-property-group">
				<label className="ideallo-property-label">Fill</label>
				<div className="ideallo-color-picker">
					<button
						type="button"
						className={`palette-swatch-btn ${!hasFill ? 'transparent' : ''}`}
						style={
							hasFill
								? { backgroundColor: colorToCss(displayStyle.fillColor) }
								: undefined
						}
						onClick={() => setOpenPopover(openPopover === 'fill' ? null : 'fill')}
					>
						{!hasFill && <span className="swatch-none">⊘</span>}
					</button>
					{openPopover === 'fill' && (
						<div className="ideallo-color-popover">
							<ColorPalette
								value={displayStyle.fillColor}
								onChange={handleFillColorChange}
								showTransparent
							/>
						</div>
					)}
				</div>
			</div>

			<div className="ideallo-property-divider" />

			{/* Stroke width */}
			<div className="ideallo-property-group">
				<label className="ideallo-property-label">Width</label>
				<NumberInput
					value={displayStyle.strokeWidth}
					onChange={handleStrokeWidthChange}
					min={1}
					max={20}
					step={1}
					suffix="px"
					style={{ width: 60 }}
				/>
			</div>
		</div>
	)
}

// vim: ts=4
