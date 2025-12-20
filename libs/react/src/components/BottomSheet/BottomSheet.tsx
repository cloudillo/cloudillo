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
import { mergeClasses, createComponent } from '../utils.js'
import { useMergedRefs, usePrefersReducedMotion } from '../hooks.js'

export type BottomSheetSnapPoint = 'closed' | 'peek' | 'half' | 'full'

export interface BottomSheetSnapConfig {
	/** Height in pixels for peek state */
	peek?: number
	/** Height as percentage of viewport for half state (0-1) */
	half?: number
	/** Height as percentage of viewport for full state (0-1) */
	full?: number
}

const DEFAULT_SNAP_CONFIG: Required<BottomSheetSnapConfig> = {
	peek: 64,
	half: 0.5,
	full: 0.9
}

export interface BottomSheetProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	/** Current snap point */
	snapPoint: BottomSheetSnapPoint
	/** Callback when snap point changes (via drag gesture) */
	onSnapChange: (snapPoint: BottomSheetSnapPoint) => void
	/** Custom snap point configuration */
	snapConfig?: BottomSheetSnapConfig
	/** Header content shown above drag handle */
	header?: React.ReactNode
	/** Main content */
	children?: React.ReactNode
	/** Whether to show backdrop when open (default: false) */
	showBackdrop?: boolean
	/** Callback when backdrop is clicked */
	onBackdropClick?: () => void
}

export const BottomSheet = createComponent<HTMLDivElement, BottomSheetProps>(
	'BottomSheet',
	(
		{
			snapPoint,
			onSnapChange,
			snapConfig,
			header,
			children,
			showBackdrop = false,
			onBackdropClick,
			className,
			style,
			...props
		},
		ref
	) => {
		const sheetRef = React.useRef<HTMLDivElement | null>(null)
		const mergedRef = useMergedRefs(ref, sheetRef)
		const prefersReducedMotion = usePrefersReducedMotion()

		// Merge config with defaults
		const config = React.useMemo(
			() => ({ ...DEFAULT_SNAP_CONFIG, ...snapConfig }),
			[snapConfig]
		)

		// Drag state
		const [isDragging, setIsDragging] = React.useState(false)
		const [dragOffset, setDragOffset] = React.useState(0)
		const dragStartRef = React.useRef<{ y: number; height: number } | null>(null)

		// Calculate height for snap point
		const getHeightForSnapPoint = React.useCallback(
			(point: BottomSheetSnapPoint): number => {
				if (typeof window === 'undefined') return 0
				const vh = window.innerHeight

				switch (point) {
					case 'closed':
						return 0
					case 'peek':
						return config.peek
					case 'half':
						return vh * config.half
					case 'full':
						return vh * config.full
					default:
						return 0
				}
			},
			[config]
		)

		// Get current height (including drag offset)
		const currentHeight = React.useMemo(() => {
			const baseHeight = getHeightForSnapPoint(snapPoint)
			return Math.max(0, baseHeight - dragOffset)
		}, [snapPoint, dragOffset, getHeightForSnapPoint])

		// Find nearest snap point for a given height
		const findNearestSnapPoint = React.useCallback(
			(height: number): BottomSheetSnapPoint => {
				const points: BottomSheetSnapPoint[] = ['closed', 'peek', 'half', 'full']
				let nearest: BottomSheetSnapPoint = 'closed'
				let minDist = Infinity

				for (const point of points) {
					const pointHeight = getHeightForSnapPoint(point)
					const dist = Math.abs(height - pointHeight)
					if (dist < minDist) {
						minDist = dist
						nearest = point
					}
				}

				return nearest
			},
			[getHeightForSnapPoint]
		)

		// Handle drag start
		const handleDragStart = React.useCallback(
			(clientY: number) => {
				dragStartRef.current = {
					y: clientY,
					height: getHeightForSnapPoint(snapPoint)
				}
				setIsDragging(true)
			},
			[snapPoint, getHeightForSnapPoint]
		)

		// Handle drag move
		const handleDragMove = React.useCallback((clientY: number) => {
			if (!dragStartRef.current) return
			const offset = clientY - dragStartRef.current.y
			setDragOffset(offset)
		}, [])

		// Handle drag end
		const handleDragEnd = React.useCallback(() => {
			if (!dragStartRef.current) return

			const finalHeight = dragStartRef.current.height - dragOffset
			const nearestPoint = findNearestSnapPoint(finalHeight)

			// Apply velocity-based snapping (swipe detection)
			// If dragged down quickly, snap to lower point
			// If dragged up quickly, snap to higher point
			// For now, just use nearest point

			dragStartRef.current = null
			setIsDragging(false)
			setDragOffset(0)

			if (nearestPoint !== snapPoint) {
				onSnapChange(nearestPoint)
			}
		}, [dragOffset, findNearestSnapPoint, snapPoint, onSnapChange])

		// Mouse event handlers
		const handleMouseDown = React.useCallback(
			(e: React.MouseEvent) => {
				e.preventDefault()
				handleDragStart(e.clientY)
			},
			[handleDragStart]
		)

		// Touch event handlers
		const handleTouchStart = React.useCallback(
			(e: React.TouchEvent) => {
				if (e.touches.length !== 1) return
				handleDragStart(e.touches[0].clientY)
			},
			[handleDragStart]
		)

		// Window-level move and end handlers
		React.useEffect(() => {
			if (!isDragging) return

			const handleMouseMove = (e: MouseEvent) => {
				handleDragMove(e.clientY)
			}

			const handleTouchMove = (e: TouchEvent) => {
				if (e.touches.length !== 1) return
				handleDragMove(e.touches[0].clientY)
			}

			const handleMouseUp = () => {
				handleDragEnd()
			}

			const handleTouchEnd = () => {
				handleDragEnd()
			}

			window.addEventListener('mousemove', handleMouseMove)
			window.addEventListener('mouseup', handleMouseUp)
			window.addEventListener('touchmove', handleTouchMove, { passive: true })
			window.addEventListener('touchend', handleTouchEnd)

			return () => {
				window.removeEventListener('mousemove', handleMouseMove)
				window.removeEventListener('mouseup', handleMouseUp)
				window.removeEventListener('touchmove', handleTouchMove)
				window.removeEventListener('touchend', handleTouchEnd)
			}
		}, [isDragging, handleDragMove, handleDragEnd])

		// Handle tap on drag handle to toggle between peek and half
		const handleHandleTap = React.useCallback(() => {
			if (isDragging) return

			if (snapPoint === 'peek') {
				onSnapChange('half')
			} else if (snapPoint === 'half' || snapPoint === 'full') {
				onSnapChange('peek')
			}
		}, [isDragging, snapPoint, onSnapChange])

		// Check if sheet is visible
		const isVisible = snapPoint !== 'closed'

		// Animation duration
		const transitionDuration = prefersReducedMotion ? '0ms' : '300ms'

		return (
			<>
				{/* Backdrop */}
				{showBackdrop && isVisible && (
					<div
						className={mergeClasses('c-bottom-sheet-backdrop', isVisible && 'show')}
						onClick={onBackdropClick}
						style={{
							transitionDuration
						}}
					/>
				)}

				{/* Sheet */}
				<div
					ref={mergedRef}
					className={mergeClasses(
						'c-bottom-sheet',
						isVisible && 'show',
						isDragging && 'dragging',
						className
					)}
					style={{
						...style,
						height: currentHeight,
						transitionDuration: isDragging ? '0ms' : transitionDuration
					}}
					role="dialog"
					aria-hidden={!isVisible}
					{...props}
				>
					{/* Drag handle area */}
					<div
						className="c-bottom-sheet-handle-area"
						onMouseDown={handleMouseDown}
						onTouchStart={handleTouchStart}
						onClick={handleHandleTap}
					>
						<div className="c-bottom-sheet-handle" />
					</div>

					{/* Header */}
					{header && <div className="c-bottom-sheet-header">{header}</div>}

					{/* Content */}
					<div className="c-bottom-sheet-content">{children}</div>
				</div>
			</>
		)
	}
)

// vim: ts=4
