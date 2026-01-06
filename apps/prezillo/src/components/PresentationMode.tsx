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
import type { Awareness } from 'y-protocols/awareness'

import type {
	ViewId,
	ViewNode,
	PrezilloObject,
	YPrezilloDocument,
	ImageObject,
	QrCodeObject,
	PollFrameObject
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
import { PollFrameRenderer } from './PollFrameRenderer'
import {
	setVote,
	clearVote,
	getVoteCounts,
	getWinningFrames,
	getLocalVote,
	getTotalVotes
} from '../awareness'

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
	/** Awareness for poll voting */
	awareness?: Awareness | null
}

/**
 * Simplified shape renderer for presentation mode (no interaction)
 */
function PresentationObjectShape({
	object,
	style,
	textStyle,
	ownerTag,
	voteCount = 0,
	totalVotes = 0,
	isWinner = false,
	hasMyVote = false,
	onPollClick,
	isFocused = false
}: {
	object: PrezilloObject
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
	ownerTag?: string
	voteCount?: number
	totalVotes?: number
	isWinner?: boolean
	hasMyVote?: boolean
	onPollClick?: (frameId: string) => void
	isFocused?: boolean
}) {
	// Hidden objects are not rendered in presentation mode
	if (object.hidden) return null

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
		case 'pollframe':
			content = (
				<PollFrameRenderer
					object={object as PollFrameObject}
					style={style}
					textStyle={textStyle}
					bounds={{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					}}
					voteCount={voteCount}
					totalVotes={totalVotes}
					isWinner={isWinner}
					hasMyVote={hasMyVote}
					onClick={
						onPollClick
							? (e) => {
									e.stopPropagation()
									onPollClick(object.id)
								}
							: undefined
					}
					isInteractive={!!onPollClick}
					isFocused={isFocused}
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
	// Poll voting props
	voteCounts?: Map<string, number>
	totalVotes?: number
	winningFrames?: string[]
	myVote?: string | null
	onPollClick?: (frameId: string) => void
	focusedPollId?: string | null
}

const PresentationSlide = React.memo(function PresentationSlide({
	view,
	objects,
	doc,
	ownerTag,
	isVisible,
	voteCounts,
	totalVotes,
	winningFrames,
	myVote,
	onPollClick,
	focusedPollId
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

				// Poll-specific props
				const isPollFrame = object.type === 'pollframe'
				const voteCount = isPollFrame && voteCounts ? voteCounts.get(object.id) || 0 : 0
				const isWinner =
					isPollFrame && winningFrames ? winningFrames.includes(object.id) : false
				const hasMyVote = isPollFrame && myVote === object.id
				const isFocused = isPollFrame && focusedPollId === object.id

				return (
					<PresentationObjectShape
						key={object.id}
						object={object}
						style={style}
						textStyle={textStyle}
						ownerTag={ownerTag}
						voteCount={voteCount}
						totalVotes={totalVotes}
						isWinner={isWinner}
						hasMyVote={hasMyVote}
						onPollClick={isPollFrame ? onPollClick : undefined}
						isFocused={isFocused}
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
	onViewChange,
	awareness
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

	// ============================================================================
	// Poll Voting State
	// ============================================================================

	const [voteCounts, setVoteCounts] = React.useState<Map<string, number>>(new Map())
	const [totalVotes, setTotalVotes] = React.useState(0)
	const [winningFrames, setWinningFrames] = React.useState<string[]>([])
	const [myVote, setMyVote] = React.useState<string | null>(null)
	const [focusedPollIndex, setFocusedPollIndex] = React.useState(-1)

	// Get poll frames on current slide for keyboard navigation
	const pollFrames = React.useMemo(
		() => currentObjects.filter((obj) => obj.type === 'pollframe'),
		[currentObjects]
	)

	const focusedPollId =
		focusedPollIndex >= 0 && focusedPollIndex < pollFrames.length
			? pollFrames[focusedPollIndex].id
			: null

	// Subscribe to awareness changes for vote updates
	React.useEffect(() => {
		if (!awareness || !currentView) return

		const updateVotes = () => {
			const viewId = currentView.id
			setVoteCounts(getVoteCounts(awareness, viewId))
			setTotalVotes(getTotalVotes(awareness, viewId))
			setWinningFrames(getWinningFrames(awareness, viewId))

			const localVote = getLocalVote(awareness)
			setMyVote(localVote?.viewId === viewId ? localVote.frameId : null)
		}

		updateVotes()
		awareness.on('change', updateVotes)
		return () => awareness.off('change', updateVotes)
	}, [awareness, currentView?.id])

	// Handle poll click - cast or toggle vote
	const handlePollClick = React.useCallback(
		(frameId: string) => {
			if (!awareness || !currentView) return

			const currentVote = getLocalVote(awareness)
			if (currentVote?.frameId === frameId && currentVote?.viewId === currentView.id) {
				// Toggle off if clicking same frame
				clearVote(awareness)
			} else {
				// Cast new vote
				setVote(awareness, frameId, currentView.id)
			}
		},
		[awareness, currentView?.id]
	)

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
				case 'PageDown':
					e.preventDefault()
					handleIndexChange(Math.min(currentIndex + 1, views.length - 1))
					break
				case ' ':
					// Space: if poll focused, vote; otherwise advance slide
					e.preventDefault()
					if (focusedPollIndex >= 0 && focusedPollIndex < pollFrames.length) {
						handlePollClick(pollFrames[focusedPollIndex].id)
					} else {
						handleIndexChange(Math.min(currentIndex + 1, views.length - 1))
					}
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
				case 'Tab':
					// Tab cycles through poll frames on the current slide
					if (pollFrames.length > 0) {
						e.preventDefault()
						const nextIndex = e.shiftKey
							? focusedPollIndex <= 0
								? pollFrames.length - 1
								: focusedPollIndex - 1
							: focusedPollIndex >= pollFrames.length - 1
								? 0
								: focusedPollIndex + 1
						setFocusedPollIndex(nextIndex)
					}
					break
				case 'Enter':
					// Enter casts vote on focused poll
					if (focusedPollIndex >= 0 && focusedPollIndex < pollFrames.length) {
						e.preventDefault()
						handlePollClick(pollFrames[focusedPollIndex].id)
					}
					break
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [
		views.length,
		onExit,
		isFollowing,
		currentIndex,
		handleIndexChange,
		pollFrames,
		focusedPollIndex,
		handlePollClick
	])

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
				voteCounts={voteCounts}
				totalVotes={totalVotes}
				winningFrames={winningFrames}
				myVote={myVote}
				onPollClick={awareness ? handlePollClick : undefined}
				focusedPollId={focusedPollId}
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
