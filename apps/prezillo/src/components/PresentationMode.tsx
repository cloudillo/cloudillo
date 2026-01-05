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
 * PresentationMode component - Fullscreen presentation view
 */

import * as React from 'react'
import { PiXBold as IcClose } from 'react-icons/pi'

import type {
	ViewId,
	ViewNode,
	PrezilloObject,
	YPrezilloDocument,
	ImageObject,
	QrCodeObject
} from '../crdt'
import { resolveShapeStyle, resolveTextStyle } from '../crdt'
import { useViewObjects } from '../hooks/useViewObjects'
import {
	calculateRotationTransform,
	buildStrokeProps,
	buildFillProps,
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE
} from '../utils'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'
import { WrappedText } from './WrappedText'
import { ImageRenderer } from './ImageRenderer'
import { QRCodeRenderer } from './QRCodeRenderer'

export interface PresentationModeProps {
	doc: YPrezilloDocument
	views: ViewNode[]
	initialViewId: ViewId | null
	onExit: () => void
	ownerTag?: string
	/** Whether following a presenter (synced mode) */
	isFollowing?: boolean
	/** Current view index from presenter (when following) */
	followingViewIndex?: number
	/** Callback when local navigation happens (for presenting) */
	onViewChange?: (viewIndex: number, viewId: ViewId) => void
}

/**
 * Simplified shape renderer for presentation mode (no interaction)
 */
function PresentationObjectShape({
	object,
	style,
	textStyle,
	ownerTag
}: {
	object: PrezilloObject
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
	ownerTag?: string
}) {
	// Build SVG props using centralized utilities
	const strokeProps = buildStrokeProps(style)
	const fillProps = buildFillProps(style)

	// Use centralized rotation transform calculation
	const rotationTransform = calculateRotationTransform(object)
	const objectOpacity = object.opacity !== 1 ? object.opacity : undefined

	let content: React.ReactNode

	switch (object.type) {
		case 'rect':
			const rectObj = object as any
			content = (
				<rect
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					rx={typeof rectObj.cornerRadius === 'number' ? rectObj.cornerRadius : undefined}
					{...fillProps}
					{...strokeProps}
				/>
			)
			break
		case 'ellipse':
			content = (
				<ellipse
					cx={object.x + object.width / 2}
					cy={object.y + object.height / 2}
					rx={object.width / 2}
					ry={object.height / 2}
					{...fillProps}
					{...strokeProps}
				/>
			)
			break
		case 'line':
			const lineObj = object as any
			const [start, end] = lineObj.points || [
				[0, object.height / 2],
				[object.width, object.height / 2]
			]
			content = (
				<line
					x1={object.x + start[0]}
					y1={object.y + start[1]}
					x2={object.x + end[0]}
					y2={object.y + end[1]}
					{...strokeProps}
				/>
			)
			break
		case 'text':
			const textObj = object as any
			const presTextContent = textObj.text || ''
			// In presentation mode, don't show empty text objects
			if (presTextContent.trim() === '') return null
			content = (
				<WrappedText
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					text={presTextContent}
					textStyle={textStyle}
				/>
			)
			break
		case 'image':
			content = <ImageRenderer object={object as ImageObject} ownerTag={ownerTag} scale={1} />
			break
		case 'qrcode':
			content = (
				<QRCodeRenderer
					object={object as QrCodeObject}
					bounds={{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					}}
				/>
			)
			break
		default:
			content = (
				<rect
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					{...fillProps}
					{...strokeProps}
				/>
			)
	}

	// Wrap with rotation and opacity if needed
	if (rotationTransform || objectOpacity !== undefined) {
		return (
			<g transform={rotationTransform} opacity={objectOpacity}>
				{content}
			</g>
		)
	}

	return content
}

/**
 * Pre-rendered slide component - memoized for performance
 */
interface PresentationSlideProps {
	view: ViewNode
	objects: PrezilloObject[]
	doc: YPrezilloDocument
	ownerTag?: string
	isVisible: boolean
}

const PresentationSlide = React.memo(function PresentationSlide({
	view,
	objects,
	doc,
	ownerTag,
	isVisible
}: PresentationSlideProps) {
	const viewAspect = view.width / view.height

	// Compute gradient background
	const gradient = view.backgroundGradient
	const hasGradient = gradient && gradient.type !== 'solid' && (gradient.stops?.length ?? 0) >= 2
	const gradientId = `pres-bg-${view.id}`

	const gradientDef = React.useMemo(() => {
		if (!hasGradient || !gradient || !gradient.stops) return null

		if (gradient.type === 'linear') {
			return {
				type: 'linear' as const,
				def: createLinearGradientDef(gradient.angle ?? 180, gradient.stops)
			}
		} else if (gradient.type === 'radial') {
			return {
				type: 'radial' as const,
				def: createRadialGradientDef(
					gradient.centerX ?? 0.5,
					gradient.centerY ?? 0.5,
					gradient.stops
				)
			}
		}
		return null
	}, [hasGradient, gradient])

	const fill = hasGradient ? `url(#${gradientId})` : view.backgroundColor || '#ffffff'

	return (
		<svg
			viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
			className={`c-presentation-svg${isVisible ? '' : ' c-presentation-svg--hidden'}`}
			style={{
				maxWidth: `calc(100vh * ${viewAspect})`,
				maxHeight: `calc(100vw / ${viewAspect})`
			}}
		>
			{/* Gradient definitions */}
			{gradientDef && (
				<defs>
					{gradientDef.type === 'linear' ? (
						<linearGradient
							id={gradientId}
							x1={gradientDef.def.x1}
							y1={gradientDef.def.y1}
							x2={gradientDef.def.x2}
							y2={gradientDef.def.y2}
						>
							{gradientDef.def.stops.map((stop, i) => (
								<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
							))}
						</linearGradient>
					) : (
						<radialGradient
							id={gradientId}
							cx={gradientDef.def.cx}
							cy={gradientDef.def.cy}
							r={gradientDef.def.r}
						>
							{gradientDef.def.stops.map((stop, i) => (
								<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
							))}
						</radialGradient>
					)}
				</defs>
			)}

			{/* Background */}
			<rect x={view.x} y={view.y} width={view.width} height={view.height} fill={fill} />

			{/* Objects */}
			{objects.map((object) => {
				const storedObj = doc.o.get(object.id)
				const style = storedObj ? resolveShapeStyle(doc, storedObj) : DEFAULT_SHAPE_STYLE
				const textStyle = storedObj ? resolveTextStyle(doc, storedObj) : DEFAULT_TEXT_STYLE

				return (
					<PresentationObjectShape
						key={object.id}
						object={object}
						style={style}
						textStyle={textStyle}
						ownerTag={ownerTag}
					/>
				)
			})}
		</svg>
	)
})

export function PresentationMode({
	doc,
	views,
	initialViewId,
	onExit,
	ownerTag,
	isFollowing,
	followingViewIndex,
	onViewChange
}: PresentationModeProps) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [currentIndex, setCurrentIndex] = React.useState(() => {
		const idx = views.findIndex((v) => v.id === initialViewId)
		return idx >= 0 ? idx : 0
	})

	// Sync with presenter when following
	React.useEffect(() => {
		if (
			isFollowing &&
			followingViewIndex !== undefined &&
			followingViewIndex !== currentIndex
		) {
			setCurrentIndex(followingViewIndex)
		}
	}, [isFollowing, followingViewIndex, currentIndex])

	// Notify when view changes (for presenting mode)
	const handleIndexChange = React.useCallback(
		(newIndex: number) => {
			setCurrentIndex(newIndex)
			if (onViewChange && views[newIndex]) {
				onViewChange(newIndex, views[newIndex].id)
			}
		},
		[onViewChange, views]
	)

	const [showControls, setShowControls] = React.useState(true)
	const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	// Get current, previous, and next views for pre-rendering
	const currentView = views[currentIndex]
	const prevView = currentIndex > 0 ? views[currentIndex - 1] : null
	const nextView = currentIndex < views.length - 1 ? views[currentIndex + 1] : null

	// Get objects for all three slides (pre-render for smooth transitions)
	const currentObjects = useViewObjects(doc, currentView?.id || null)
	const prevObjects = useViewObjects(doc, prevView?.id || null)
	const nextObjects = useViewObjects(doc, nextView?.id || null)

	// Enter fullscreen on mount
	React.useEffect(() => {
		const container = containerRef.current
		if (container && container.requestFullscreen) {
			container.requestFullscreen().catch(() => {
				// Fullscreen failed, continue anyway
			})
		}

		// Exit presentation mode when leaving fullscreen
		const handleFullscreenChange = () => {
			if (!document.fullscreenElement) {
				onExit()
			}
		}

		document.addEventListener('fullscreenchange', handleFullscreenChange)
		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange)
			if (document.fullscreenElement) {
				document.exitFullscreen().catch(() => {})
			}
		}
	}, [onExit])

	// Keyboard navigation (disabled when following)
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// When following, only allow Escape to exit
			if (isFollowing) {
				if (e.key === 'Escape') {
					e.preventDefault()
					onExit()
				}
				return
			}

			switch (e.key) {
				case 'ArrowRight':
				case 'ArrowDown':
				case ' ':
				case 'PageDown':
					e.preventDefault()
					handleIndexChange(Math.min(currentIndex + 1, views.length - 1))
					break
				case 'ArrowLeft':
				case 'ArrowUp':
				case 'PageUp':
					e.preventDefault()
					handleIndexChange(Math.max(currentIndex - 1, 0))
					break
				case 'Home':
					e.preventDefault()
					handleIndexChange(0)
					break
				case 'End':
					e.preventDefault()
					handleIndexChange(views.length - 1)
					break
				case 'Escape':
					e.preventDefault()
					onExit()
					break
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [views.length, onExit, isFollowing, currentIndex, handleIndexChange])

	// Auto-hide controls after inactivity
	React.useEffect(() => {
		const handleMouseMove = () => {
			setShowControls(true)
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
			hideTimeoutRef.current = setTimeout(() => setShowControls(false), 1000)
		}
		handleMouseMove() // Start timer immediately
		window.addEventListener('mousemove', handleMouseMove)
		return () => {
			window.removeEventListener('mousemove', handleMouseMove)
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
		}
	}, [])

	// Click to advance (disabled when following)
	const handleClick = (e: React.MouseEvent) => {
		// When following, clicks do nothing (synced with presenter)
		if (isFollowing) return

		// Right side of screen = next, left side = previous
		const rect = containerRef.current?.getBoundingClientRect()
		if (rect) {
			const clickX = e.clientX - rect.left
			if (clickX > rect.width / 2) {
				handleIndexChange(Math.min(currentIndex + 1, views.length - 1))
			} else {
				handleIndexChange(Math.max(currentIndex - 1, 0))
			}
		}
	}

	if (!currentView) return null

	return (
		<div
			ref={containerRef}
			onClick={handleClick}
			className={`c-presentation-container${showControls ? '' : ' c-controls-hidden'}${isFollowing ? ' following' : ''}`}
		>
			{/* Pre-rendered previous slide (hidden) */}
			{prevView && (
				<PresentationSlide
					key={`prev-${prevView.id}`}
					view={prevView}
					objects={prevObjects}
					doc={doc}
					ownerTag={ownerTag}
					isVisible={false}
				/>
			)}

			{/* Current slide (visible) */}
			<PresentationSlide
				key={`current-${currentView.id}`}
				view={currentView}
				objects={currentObjects}
				doc={doc}
				ownerTag={ownerTag}
				isVisible={true}
			/>

			{/* Pre-rendered next slide (hidden) */}
			{nextView && (
				<PresentationSlide
					key={`next-${nextView.id}`}
					view={nextView}
					objects={nextObjects}
					doc={doc}
					ownerTag={ownerTag}
					isVisible={false}
				/>
			)}

			{/* Slide counter */}
			<div className="c-presentation-counter">
				{currentIndex + 1} / {views.length}
			</div>

			{/* Exit button */}
			<button
				onClick={(e) => {
					e.stopPropagation()
					onExit()
				}}
				className="c-presentation-exit"
				title="Exit presentation (Esc)"
			>
				<IcClose />
			</button>
		</div>
	)
}

// vim: ts=4
