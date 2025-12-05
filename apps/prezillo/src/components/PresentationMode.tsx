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

import type { ViewId, ViewNode, PrezilloObject, YPrezilloDocument } from '../crdt'
import { resolveShapeStyle, resolveTextStyle } from '../crdt'
import { useViewObjects } from '../hooks/useViewObjects'
import { WrappedText } from './WrappedText'
import { DEFAULT_SHAPE_STYLE, DEFAULT_TEXT_STYLE } from '../utils/constants'

export interface PresentationModeProps {
	doc: YPrezilloDocument
	views: ViewNode[]
	initialViewId: ViewId | null
	onExit: () => void
}

/**
 * Simplified shape renderer for presentation mode (no interaction)
 */
function PresentationObjectShape({
	object,
	style,
	textStyle
}: {
	object: PrezilloObject
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
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

	switch (object.type) {
		case 'rect':
			return (
				<rect
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					rx={(object as any).cornerRadius}
					{...fillProps}
					{...strokeProps}
				/>
			)
		case 'ellipse':
			return (
				<ellipse
					cx={object.x + object.width / 2}
					cy={object.y + object.height / 2}
					rx={object.width / 2}
					ry={object.height / 2}
					{...fillProps}
					{...strokeProps}
				/>
			)
		case 'line':
			const lineObj = object as any
			const [start, end] = lineObj.points || [
				[0, 0],
				[object.width, object.height]
			]
			return (
				<line
					x1={object.x + start[0]}
					y1={object.y + start[1]}
					x2={object.x + end[0]}
					y2={object.y + end[1]}
					{...strokeProps}
				/>
			)
		case 'text':
			const textObj = object as any
			const presTextContent = textObj.text || ''
			// In presentation mode, don't show empty text objects
			if (presTextContent.trim() === '') return null
			return (
				<WrappedText
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					text={presTextContent}
					textStyle={textStyle}
				/>
			)
		default:
			return (
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
}

export function PresentationMode({ doc, views, initialViewId, onExit }: PresentationModeProps) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [currentIndex, setCurrentIndex] = React.useState(() => {
		const idx = views.findIndex((v) => v.id === initialViewId)
		return idx >= 0 ? idx : 0
	})

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
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				width: '100vw',
				height: '100vh',
				backgroundColor: '#000',
				zIndex: 9999,
				cursor: 'none',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<svg
				viewBox={`${currentView.x} ${currentView.y} ${currentView.width} ${currentView.height}`}
				style={{
					width: '100%',
					height: '100%',
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
						/>
					)
				})}
			</svg>

			{/* Slide counter */}
			<div
				style={{
					position: 'absolute',
					bottom: 20,
					right: 20,
					color: 'rgba(255,255,255,0.5)',
					fontSize: 14,
					fontFamily: 'system-ui'
				}}
			>
				{currentIndex + 1} / {views.length}
			</div>

			{/* Exit button */}
			<button
				onClick={(e) => {
					e.stopPropagation()
					onExit()
				}}
				style={{
					position: 'absolute',
					top: 20,
					right: 20,
					background: 'rgba(255,255,255,0.1)',
					border: 'none',
					borderRadius: 4,
					padding: '8px 12px',
					color: 'rgba(255,255,255,0.7)',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					gap: 8
				}}
				title="Exit presentation (Esc)"
			>
				<IcClose />
			</button>
		</div>
	)
}

// vim: ts=4
