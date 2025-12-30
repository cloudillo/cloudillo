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

import * as React from 'react'
import { mergeClasses, createComponent } from '@cloudillo/react'
import type { GradientStop } from '../../types/gradient.js'
import { addStop, sortStops, getColorAtPosition } from '../../utils/gradient.js'

export interface GradientBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	/** Current color stops */
	stops: GradientStop[]
	/** Called when stops change */
	onChange: (stops: GradientStop[]) => void
	/** Called during drag for live preview */
	onPreview?: (stops: GradientStop[]) => void
	/** Currently selected stop index */
	selectedIndex?: number
	/** Called when a stop is selected */
	onSelectStop?: (index: number) => void
	/** Whether the control is disabled */
	disabled?: boolean
}

/** Distance in pixels to drag vertically before stop is marked for deletion */
const DELETE_THRESHOLD = 40

/**
 * Gradient bar with draggable color stops.
 * Click on bar to add stop, drag stops to reposition.
 * Drag a stop vertically away from the bar to delete it.
 * Double-click also removes a stop.
 */
export const GradientBar = createComponent<HTMLDivElement, GradientBarProps>(
	'GradientBar',
	(
		{ className, stops, onChange, onPreview, selectedIndex, onSelectStop, disabled, ...props },
		ref
	) => {
		const barRef = React.useRef<HTMLDivElement>(null)
		const [dragIndex, setDragIndex] = React.useState<number | null>(null)
		const [dragStartX, setDragStartX] = React.useState(0)
		const [dragStartY, setDragStartY] = React.useState(0)
		const [dragStartPos, setDragStartPos] = React.useState(0)
		const [isDraggedOut, setIsDraggedOut] = React.useState(false)

		// Sort stops for display
		const sortedStops = React.useMemo(() => sortStops(stops), [stops])

		// Generate CSS gradient for the bar background
		const gradientCSS = React.useMemo(() => {
			if (sortedStops.length === 0) return '#ffffff'
			if (sortedStops.length === 1) return sortedStops[0].color

			const stopsCSS = sortedStops
				.map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
				.join(', ')
			return `linear-gradient(to right, ${stopsCSS})`
		}, [sortedStops])

		// Get position from mouse/touch event
		const getPositionFromEvent = React.useCallback(
			(e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): number => {
				if (!barRef.current) return 0

				const rect = barRef.current.getBoundingClientRect()
				const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
				const x = clientX - rect.left
				return Math.max(0, Math.min(1, x / rect.width))
			},
			[]
		)

		// Handle click on bar to add new stop
		const handleBarClick = React.useCallback(
			(e: React.MouseEvent) => {
				if (disabled || dragIndex !== null) return

				// Check if click was on a stop handle
				const target = e.target as HTMLElement
				if (target.classList.contains('c-gradient-bar-stop')) return

				const position = getPositionFromEvent(e)
				const color = getColorAtPosition(stops, position)
				const newStops = addStop(stops, position, color)
				onChange(newStops)

				// Select the new stop
				const newIndex = newStops.findIndex((s) => s.position === position)
				onSelectStop?.(newIndex)
			},
			[disabled, dragIndex, stops, onChange, onSelectStop, getPositionFromEvent]
		)

		// Handle stop drag start
		const handleStopMouseDown = React.useCallback(
			(e: React.MouseEvent | React.TouchEvent, index: number) => {
				if (disabled) return
				e.preventDefault()
				e.stopPropagation()

				const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
				const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
				setDragIndex(index)
				setDragStartX(clientX)
				setDragStartY(clientY)
				setDragStartPos(stops[index].position)
				setIsDraggedOut(false)
				onSelectStop?.(index)
			},
			[disabled, stops, onSelectStop]
		)

		// Handle drag move
		React.useEffect(() => {
			if (dragIndex === null) return

			const handleMove = (e: MouseEvent | TouchEvent) => {
				if (!barRef.current) return

				const rect = barRef.current.getBoundingClientRect()
				const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
				const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
				const deltaX = clientX - dragStartX
				const deltaY = Math.abs(clientY - dragStartY)
				const deltaPos = deltaX / rect.width

				// Check if dragged out vertically (for deletion)
				const canDelete = stops.length > 2
				const draggedOut = canDelete && deltaY > DELETE_THRESHOLD
				setIsDraggedOut(draggedOut)

				const newPosition = Math.max(0, Math.min(1, dragStartPos + deltaPos))
				const newStops = stops.map((stop, i) =>
					i === dragIndex ? { ...stop, position: newPosition } : stop
				)

				onPreview?.(newStops)
			}

			const handleEnd = (e: MouseEvent | TouchEvent) => {
				if (!barRef.current || dragIndex === null) return

				const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY
				const deltaY = Math.abs(clientY - dragStartY)
				const canDelete = stops.length > 2
				const shouldDelete = canDelete && deltaY > DELETE_THRESHOLD

				if (shouldDelete) {
					// Delete the stop
					const newStops = stops.filter((_, i) => i !== dragIndex)
					onChange(newStops)

					// Select adjacent stop
					if (selectedIndex !== undefined) {
						if (dragIndex <= selectedIndex && selectedIndex > 0) {
							onSelectStop?.(selectedIndex - 1)
						} else if (dragIndex < selectedIndex) {
							onSelectStop?.(selectedIndex - 1)
						}
					}
				} else {
					// Commit the position change
					const rect = barRef.current.getBoundingClientRect()
					const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX
					const deltaX = clientX - dragStartX
					const deltaPos = deltaX / rect.width
					const newPosition = Math.max(0, Math.min(1, dragStartPos + deltaPos))

					const newStops = stops.map((stop, i) =>
						i === dragIndex ? { ...stop, position: newPosition } : stop
					)
					onChange(newStops)
				}

				setDragIndex(null)
				setIsDraggedOut(false)
			}

			window.addEventListener('mousemove', handleMove)
			window.addEventListener('mouseup', handleEnd)
			window.addEventListener('touchmove', handleMove)
			window.addEventListener('touchend', handleEnd)

			return () => {
				window.removeEventListener('mousemove', handleMove)
				window.removeEventListener('mouseup', handleEnd)
				window.removeEventListener('touchmove', handleMove)
				window.removeEventListener('touchend', handleEnd)
			}
		}, [
			dragIndex,
			dragStartX,
			dragStartY,
			dragStartPos,
			stops,
			onChange,
			onPreview,
			selectedIndex,
			onSelectStop
		])

		// Handle double-click to remove stop
		const handleStopDoubleClick = React.useCallback(
			(e: React.MouseEvent, index: number) => {
				if (disabled || stops.length <= 2) return
				e.preventDefault()
				e.stopPropagation()

				const newStops = stops.filter((_, i) => i !== index)
				onChange(newStops)

				// Select adjacent stop
				if (selectedIndex !== undefined) {
					if (index <= selectedIndex && selectedIndex > 0) {
						onSelectStop?.(selectedIndex - 1)
					}
				}
			},
			[disabled, stops, onChange, selectedIndex, onSelectStop]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses('c-gradient-bar-container', className)}
				{...props}
			>
				<div
					ref={barRef}
					className="c-gradient-bar"
					style={{ background: gradientCSS }}
					onClick={handleBarClick}
					role="slider"
					aria-label="Gradient color stops"
					aria-valuemin={0}
					aria-valuemax={100}
					tabIndex={disabled ? -1 : 0}
				>
					{sortedStops.map((stop, index) => {
						// Find the original index for selection tracking
						const originalIndex = stops.findIndex(
							(s) => s.color === stop.color && s.position === stop.position
						)
						const isBeingRemoved = dragIndex === originalIndex && isDraggedOut

						return (
							<div
								key={`${stop.position}-${index}`}
								className={mergeClasses(
									'c-gradient-bar-stop',
									originalIndex === selectedIndex && 'selected',
									dragIndex === originalIndex && 'dragging',
									isBeingRemoved && 'removing'
								)}
								style={{
									left: `${stop.position * 100}%`,
									backgroundColor: stop.color
								}}
								onMouseDown={(e) => handleStopMouseDown(e, originalIndex)}
								onTouchStart={(e) => handleStopMouseDown(e, originalIndex)}
								onDoubleClick={(e) => handleStopDoubleClick(e, originalIndex)}
								role="button"
								aria-label={`Color stop at ${Math.round(stop.position * 100)}%, color ${stop.color}${isBeingRemoved ? ' (release to delete)' : ''}`}
								tabIndex={disabled ? -1 : 0}
							/>
						)
					})}
				</div>
			</div>
		)
	}
)

// vim: ts=4
