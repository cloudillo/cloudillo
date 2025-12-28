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

import type { ViewId, ViewNode, PrezilloObject, YPrezilloDocument, ImageObject } from '../crdt'
import { resolveShapeStyle, resolveTextStyle } from '../crdt'
import { useViewObjects } from '../hooks/useViewObjects'
import { WrappedText } from './WrappedText'
import { ImageRenderer } from './ImageRenderer'
import { DEFAULT_SHAPE_STYLE, DEFAULT_TEXT_STYLE } from '../utils/constants'

export interface PresentationModeProps {
	doc: YPrezilloDocument
	views: ViewNode[]
	initialViewId: ViewId | null
	onExit: () => void
	ownerTag?: string
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
	const strokeProps = {
		stroke: style.stroke,
		strokeWidth: style.strokeWidth,
		strokeOpacity: style.strokeOpacity,
		strokeDasharray: style.strokeDasharray || undefined,
		strokeLinecap: style.strokeLinecap,
		strokeLinejoin: style.strokeLinejoin
	}

	const fillProps = {
		fill: style.fill === 'none' ? 'transparent' : style.fill,
		fillOpacity: style.fillOpacity
	}

	// Calculate rotation transform around pivot point
	const pivotX = object.pivotX ?? 0.5
	const pivotY = object.pivotY ?? 0.5
	const cx = object.x + object.width * pivotX
	const cy = object.y + object.height * pivotY
	const rotation = object.rotation ?? 0
	const rotationTransform = rotation !== 0 ? `rotate(${rotation} ${cx} ${cy})` : undefined
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

export function PresentationMode({
	doc,
	views,
	initialViewId,
	onExit,
	ownerTag
}: PresentationModeProps) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [currentIndex, setCurrentIndex] = React.useState(() => {
		const idx = views.findIndex((v) => v.id === initialViewId)
		return idx >= 0 ? idx : 0
	})

	const [showControls, setShowControls] = React.useState(true)
	const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	const currentView = views[currentIndex]
	const viewObjects = useViewObjects(doc, currentView?.id || null)

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

	// Keyboard navigation
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowRight':
				case 'ArrowDown':
				case ' ':
				case 'PageDown':
					e.preventDefault()
					setCurrentIndex((i) => Math.min(i + 1, views.length - 1))
					break
				case 'ArrowLeft':
				case 'ArrowUp':
				case 'PageUp':
					e.preventDefault()
					setCurrentIndex((i) => Math.max(i - 1, 0))
					break
				case 'Home':
					e.preventDefault()
					setCurrentIndex(0)
					break
				case 'End':
					e.preventDefault()
					setCurrentIndex(views.length - 1)
					break
				case 'Escape':
					e.preventDefault()
					onExit()
					break
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [views.length, onExit])

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

	// Click to advance
	const handleClick = (e: React.MouseEvent) => {
		// Right side of screen = next, left side = previous
		const rect = containerRef.current?.getBoundingClientRect()
		if (rect) {
			const clickX = e.clientX - rect.left
			if (clickX > rect.width / 2) {
				setCurrentIndex((i) => Math.min(i + 1, views.length - 1))
			} else {
				setCurrentIndex((i) => Math.max(i - 1, 0))
			}
		}
	}

	if (!currentView) return null

	// Calculate scale to fit view in screen
	const viewAspect = currentView.width / currentView.height

	return (
		<div
			ref={containerRef}
			onClick={handleClick}
			className={`c-presentation-container${showControls ? '' : ' c-controls-hidden'}`}
		>
			<svg
				viewBox={`${currentView.x} ${currentView.y} ${currentView.width} ${currentView.height}`}
				className="c-presentation-svg"
				style={{
					maxWidth: `calc(100vh * ${viewAspect})`,
					maxHeight: `calc(100vw / ${viewAspect})`,
					backgroundColor: currentView.backgroundColor || '#ffffff'
				}}
			>
				{viewObjects.map((object) => {
					const storedObj = doc.o.get(object.id)
					const style = storedObj
						? resolveShapeStyle(doc, storedObj)
						: DEFAULT_SHAPE_STYLE
					const textStyle = storedObj
						? resolveTextStyle(doc, storedObj)
						: DEFAULT_TEXT_STYLE

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
