// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * PresentationMode component - Fullscreen presentation view
 */

import { RichTextDisplay } from '@cloudillo/canvas-text'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'
import { IcClose, IcFullscreen, IcNext, IcPrev, SvgViewEmbed } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	clearVote,
	getFollowerCount,
	getLocalPresenterFollowerCount,
	getLocalVote,
	getTotalVotes,
	getVoteCounts,
	getWinningFrames,
	setVote
} from '../awareness'
import type {
	DocumentObject,
	ImageObject,
	PollFrameObject,
	PrezilloObject,
	QrCodeObject,
	StateVarObject,
	SymbolObject,
	TextObject,
	ViewId,
	ViewNode,
	YPrezilloDocument
} from '../crdt'
import {
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE,
	resolveShapeStyle,
	resolveTextStyle
} from '../crdt'
import { getBulletIcon, migrateBullet } from '../data/bullet-icons'
import type { UsePrezilloDocumentResult } from '../hooks/usePrezilloDocument'
import { useViewObjects } from '../hooks/useViewObjects'
import type { BlankMode, PresentationMsg } from '../presentation-channel'
import { getExternalScreen, isSwipe, tapZone } from '../presenter'
import { buildFillProps, buildStrokeProps, calculateRotationTransform } from '../utils'
import { ImageRenderer } from './ImageRenderer'
import { PollFrameRenderer } from './PollFrameRenderer'
import { NotesText, PresenterView, PresenterWindow } from './PresenterWindow'
import { QRCodeRenderer } from './QRCodeRenderer'
import { StateVarRenderer } from './StateVarRenderer'
import { SymbolRenderer } from './SymbolRenderer'

export interface PresentationModeProps {
	prezillo: UsePrezilloDocumentResult
	views: ViewNode[]
	initialViewId: ViewId | null
	onExit: () => void
	ownerTag?: string
	token?: string
	/** Whether to use fullscreen mode (default: true for backward compat) */
	fullscreen?: boolean
	/** Whether following a presenter (synced mode) */
	isFollowing?: boolean
	/** Current view index from presenter (when following) */
	followingViewIndex?: number
	/** Client ID of the presenter being followed (for follower count) */
	followingPresenterClientId?: number
	/** Callback when local navigation happens (for presenting) */
	onViewChange?: (viewIndex: number, viewId: ViewId) => void
	/** Source file ID for document embeds */
	sourceFileId?: string
	/** "Present with notes": presenter popup, or the notes drawer when there is none */
	withNotes?: boolean
	/** Presenter popup opened in the start click (`openPresenterWindow`), rendered via portal */
	presenterWindow?: Window | null
	/** Presentation API session (`usePresentationMode` `castSend`): the iframe shows the presenter layout */
	castSend?: ((msg: PresentationMsg) => void) | null
}

/** Fullscreen controls hide after this much inactivity */
const CONTROLS_HIDE_MS = 3000

/**
 * Simplified shape renderer for presentation mode (no interaction)
 */
function PresentationObjectShape({
	object,
	doc,
	style,
	textStyle,
	ownerTag,
	token,
	sourceFileId,
	voteCount = 0,
	totalVotes = 0,
	isWinner = false,
	hasMyVote = false,
	onPollClick,
	isFocused = false,
	userCount = 1,
	canWrite = false,
	thumbnail = false,
	imageScale = 1,
	noEmbeds = false
}: {
	object: PrezilloObject
	doc: YPrezilloDocument
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
	ownerTag?: string
	token?: string
	sourceFileId?: string
	voteCount?: number
	totalVotes?: number
	isWinner?: boolean
	hasMyVote?: boolean
	onPollClick?: (frameId: string) => void
	isFocused?: boolean
	userCount?: number
	/** Host presentation is writable — gates embed write access */
	canWrite?: boolean
	/** Rail thumbnail: no live embeds, no links */
	thumbnail?: boolean
	/** Image variant scale (thumbnails fetch a small variant) */
	imageScale?: number
	/** Document embeds as placeholders (the receiver has no app bus) */
	noEmbeds?: boolean
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
		case 'rect': {
			content = (
				<rect
					x={object.x}
					y={object.y}
					width={object.width}
					height={object.height}
					rx={typeof object.cornerRadius === 'number' ? object.cornerRadius : undefined}
					{...fillProps}
					{...strokeProps}
				/>
			)
			break
		}
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
		case 'line': {
			const [start, end] = object.points || [
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
		}
		case 'text': {
			const textObj = object as TextObject
			const yText = doc.rt.get(object.id)
			const presTextContent = textObj.text || ''
			// In presentation mode, don't show empty text objects
			if (!yText && presTextContent.trim() === '') return null
			// Build bullet icon URL for custom list markers
			const presBulletIconUrl = (() => {
				const lb = textStyle.listBullet
				if (!lb) return undefined
				const bulletId = migrateBullet(lb)
				if (!bulletId) return undefined
				const icon = getBulletIcon(bulletId)
				if (!icon) return undefined
				const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${icon.viewBox.join(' ')}'><path d='${icon.pathData}' fill='black'/></svg>`
				return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
			})()
			if (yText) {
				content = (
					<RichTextDisplay
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						yText={yText}
						baseStyle={{
							fontFamily: textStyle.fontFamily,
							fontSize: textStyle.fontSize,
							fontWeight: textStyle.fontWeight,
							fontItalic: textStyle.fontItalic,
							textDecoration: textStyle.textDecoration,
							fill: textStyle.fill,
							textAlign: textStyle.textAlign,
							verticalAlign: textStyle.verticalAlign,
							lineHeight: textStyle.lineHeight,
							letterSpacing: textStyle.letterSpacing,
							listBullet: textStyle.listBullet
						}}
						bulletIconUrl={presBulletIconUrl}
						linksClickable={!thumbnail}
					/>
				)
			} else {
				// Fallback - shouldn't happen after migration
				return null
			}
			break
		}
		case 'image':
			content = (
				<>
					<rect
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						{...fillProps}
						stroke="none"
					/>
					<ImageRenderer
						object={object as ImageObject}
						ownerTag={ownerTag}
						token={token}
						scale={imageScale}
					/>
					<rect
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						fill="none"
						{...strokeProps}
					/>
				</>
			)
			break
		case 'document': {
			const docObj = object as DocumentObject
			content =
				thumbnail || noEmbeds ? (
					<rect
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						fill="var(--col-container-low)"
					/>
				) : (
					<SvgViewEmbed
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						fileId={docObj.fileId}
						contentType={docObj.contentType}
						sourceFileId={sourceFileId || ''}
						appId={docObj.appId}
						access={docObj.editable && canWrite ? 'write' : 'read'}
						nav={docObj.navState}
						settings={{ sizing: 'box', lastNatural: docObj.aspectRatio }}
						canInteract
						active
					/>
				)
			break
		}
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
		case 'symbol':
			content = (
				<SymbolRenderer
					object={object as SymbolObject}
					style={style}
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
		case 'statevar':
			content = (
				<StateVarRenderer
					object={object as StateVarObject}
					textStyle={textStyle}
					bounds={{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					}}
					stateValues={{ userCount }}
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
 * Each slide fetches its own objects to maintain stable identity
 */
interface PresentationSlideProps {
	view: ViewNode
	doc: YPrezilloDocument
	ownerTag?: string
	token?: string
	sourceFileId?: string
	isVisible: boolean
	/** Whether to render content (objects). False = empty placeholder for performance */
	renderContent?: boolean
	// Poll voting props
	voteCounts?: Map<string, number>
	totalVotes?: number
	winningFrames?: string[]
	myVote?: string | null
	onPollClick?: (frameId: string) => void
	focusedPollId?: string | null
	// State variable props
	userCount?: number
	canWrite?: boolean
	/** Rail thumbnail: non-interactive, aria-hidden, no live embeds or poll votes */
	thumbnail?: boolean
	/** Document embeds as placeholders (the receiver has no app bus) */
	noEmbeds?: boolean
}

/** Thumbnail width in CSS px (`.c-slide-thumb__box` in style.css): picks the image variant */
const THUMB_W = 160

export const PresentationSlide = React.memo(function PresentationSlide({
	view,
	doc,
	ownerTag,
	token,
	sourceFileId,
	isVisible,
	renderContent = true,
	voteCounts,
	totalVotes,
	winningFrames,
	myVote,
	onPollClick,
	focusedPollId,
	userCount = 1,
	canWrite,
	thumbnail = false,
	noEmbeds
}: PresentationSlideProps) {
	// Thumbnails may exist several times per slide (rail, drag overlay, mobile grid): unique id
	const instanceId = React.useId().replace(/[^\w-]/g, '')
	// Each slide fetches its own objects - this keeps the component stable
	// Only fetch when renderContent is true to avoid unnecessary work
	const objects = useViewObjects(doc, renderContent ? view.id : null)
	const viewAspect = view.width / view.height

	// Compute gradient background
	const gradient = view.backgroundGradient
	const hasGradient = gradient && gradient.type !== 'solid' && (gradient.stops?.length ?? 0) >= 2
	const gradientId = thumbnail ? `thumb-bg-${instanceId}` : `pres-bg-${view.id}`

	const gradientDef = React.useMemo(() => {
		if (!hasGradient || !gradient?.stops) return null

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
			aria-hidden={thumbnail || undefined}
			className={
				thumbnail
					? 'c-slide-thumb__svg'
					: `c-presentation-svg${isVisible ? '' : ' c-presentation-svg--hidden'}`
			}
			style={
				thumbnail
					? { width: '100%', pointerEvents: 'none' }
					: {
							maxWidth: `calc(100vh * ${viewAspect})`,
							maxHeight: `calc(100vw / ${viewAspect})`
						}
			}
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

				// Poll-specific props (none on thumbnails)
				const isPollFrame = !thumbnail && object.type === 'pollframe'
				const voteCount = isPollFrame && voteCounts ? voteCounts.get(object.id) || 0 : 0
				const isWinner =
					isPollFrame && winningFrames ? winningFrames.includes(object.id) : false
				const hasMyVote = isPollFrame && myVote === object.id
				const isFocused = isPollFrame && focusedPollId === object.id

				return (
					<PresentationObjectShape
						key={object.id}
						object={object}
						doc={doc}
						style={style}
						textStyle={textStyle}
						ownerTag={ownerTag}
						token={token}
						sourceFileId={sourceFileId}
						voteCount={voteCount}
						totalVotes={isPollFrame ? totalVotes : undefined}
						isWinner={isWinner}
						hasMyVote={hasMyVote}
						onPollClick={isPollFrame ? onPollClick : undefined}
						isFocused={isFocused}
						userCount={userCount}
						canWrite={canWrite}
						thumbnail={thumbnail}
						imageScale={thumbnail ? THUMB_W / view.width : 1}
						noEmbeds={noEmbeds}
					/>
				)
			})}
		</svg>
	)
})

/**
 * Starting index into `views` (the presented slides). Started on a skipped slide: the next
 * presented slide after it in `order` (all slides), else the first.
 */
export function initialPresentedIndex(
	order: string[],
	views: ViewNode[],
	initialViewId?: ViewId | null
): number {
	const idx = views.findIndex((v) => v.id === initialViewId)
	if (idx >= 0 || !initialViewId) return Math.max(idx, 0)
	for (const id of order.slice(order.indexOf(initialViewId) + 1)) {
		const i = views.findIndex((v) => v.id === id)
		if (i >= 0) return i
	}
	return 0
}

export function PresentationMode({
	prezillo,
	views,
	initialViewId,
	onExit,
	ownerTag,
	token,
	fullscreen = true,
	isFollowing,
	followingViewIndex,
	followingPresenterClientId,
	onViewChange,
	sourceFileId,
	withNotes,
	presenterWindow,
	castSend
}: PresentationModeProps) {
	const { t } = useTranslation()
	const { doc, awareness } = prezillo
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [coarse] = React.useState(
		() =>
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(pointer: coarse)').matches
	)

	// The presenter popup until it goes away (pagehide); the audience view keeps going without it
	const [popup, setPopup] = React.useState<Window | null>(() =>
		presenterWindow && !presenterWindow.closed ? presenterWindow : null
	)
	React.useEffect(() => {
		if (!popup) return
		const gone = () => setPopup(null)
		const closePopup = () => popup.close()
		popup.addEventListener('pagehide', gone)
		window.addEventListener('pagehide', closePopup)
		return () => {
			popup.removeEventListener('pagehide', gone)
			window.removeEventListener('pagehide', closePopup)
		}
	}, [popup])

	// Notes drawer (N): open from the start when notes were asked for but no popup is there
	const [notesOpen, setNotesOpen] = React.useState(() => !!withNotes && !popup)
	// Tracked by id: a skip toggle or reorder mid-show shifts indexes under us
	const [current, setCurrent] = React.useState<{ id: ViewId | undefined; index: number }>(() => {
		const index = initialPresentedIndex(doc.vo.toArray(), views, initialViewId)
		return { id: views[index]?.id, index }
	})
	const setCurrentIndex = React.useCallback(
		(index: number) => setCurrent({ id: views[index]?.id, index }),
		[views]
	)
	const foundIndex = views.findIndex((v) => v.id === current.id)
	const currentIndex =
		foundIndex >= 0 ? foundIndex : Math.max(0, Math.min(current.index, views.length - 1))

	// Current slide got skipped or deleted: adopt the neighbour and move the editor along
	React.useEffect(() => {
		const view = views[currentIndex]
		if (!view || view.id === current.id) return
		setCurrent({ id: view.id, index: currentIndex })
		onViewChange?.(currentIndex, view.id)
	}, [views, currentIndex, current.id, onViewChange])

	// Started off a skipped slide: move the editor and the presenter broadcast along, once
	const startedOffRef = React.useRef(false)
	React.useEffect(() => {
		if (startedOffRef.current) return
		startedOffRef.current = true
		const view = views[currentIndex]
		if (view && view.id !== initialViewId) onViewChange?.(currentIndex, view.id)
	}, [views, currentIndex, initialViewId, onViewChange])

	// Sync with presenter when following
	React.useEffect(() => {
		if (
			isFollowing &&
			followingViewIndex !== undefined &&
			followingViewIndex !== currentIndex
		) {
			// Clear vote when slide changes (poll session ends)
			if (awareness) clearVote(awareness)
			setCurrentIndex(followingViewIndex)
			setFocusedPollIndex(-1) // Reset poll focus when slide changes
		}
	}, [isFollowing, followingViewIndex, currentIndex, awareness, setCurrentIndex])

	// Notify when view changes (for presenting mode)
	const handleIndexChange = React.useCallback(
		(newIndex: number) => {
			// Clear vote when slide changes (poll session ends)
			if (awareness) clearVote(awareness)
			setCurrentIndex(newIndex)
			setFocusedPollIndex(-1) // Reset poll focus when slide changes
			if (onViewChange && views[newIndex]) {
				onViewChange(newIndex, views[newIndex].id)
			}
		},
		[awareness, onViewChange, views, setCurrentIndex]
	)

	const [showControls, setShowControls] = React.useState(true)
	const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	// Get current view for poll voting
	const currentView = views[currentIndex]

	// Get objects for current view (needed for poll keyboard navigation)
	const currentObjects = useViewObjects(doc, currentView?.id || null)

	// ============================================================================
	// Poll Voting State
	// ============================================================================

	const [voteCounts, setVoteCounts] = React.useState<Map<string, number>>(new Map())
	const [totalVotes, setTotalVotes] = React.useState(0)
	const [winningFrames, setWinningFrames] = React.useState<string[]>([])
	const [myVote, setMyVote] = React.useState<string | null>(null)
	const [focusedPollIndex, setFocusedPollIndex] = React.useState(-1)
	const [userCount, setUserCount] = React.useState(1)

	// Get poll frames on current slide for keyboard navigation
	const pollFrames = React.useMemo(
		() => currentObjects.filter((obj) => obj.type === 'pollframe'),
		[currentObjects]
	)

	const focusedPollId =
		focusedPollIndex >= 0 && focusedPollIndex < pollFrames.length
			? pollFrames[focusedPollIndex].id
			: null

	// Subscribe to awareness changes for vote updates and follower count
	React.useEffect(() => {
		if (!awareness || !currentView) return

		const updateVotes = () => {
			const viewId = currentView.id
			setVoteCounts(getVoteCounts(awareness, viewId))
			setTotalVotes(getTotalVotes(awareness, viewId))
			setWinningFrames(getWinningFrames(awareness, viewId))

			const localVote = getLocalVote(awareness)
			setMyVote(localVote?.viewId === viewId ? localVote.frameId : null)

			// Update follower count
			// If following, show the follower count for the presenter being followed
			// If presenting, show our own follower count
			if (isFollowing && followingPresenterClientId !== undefined) {
				setUserCount(getFollowerCount(awareness, followingPresenterClientId))
			} else {
				setUserCount(getLocalPresenterFollowerCount(awareness))
			}
		}

		updateVotes()
		awareness.on('change', updateVotes)
		return () => awareness.off('change', updateVotes)
	}, [awareness, currentView?.id, isFollowing, followingPresenterClientId])

	// Presentation API receiver follows the slide, the poll results and the blank screen (B/W)
	const [blank, setBlank] = React.useState<BlankMode | null>(null)
	React.useEffect(() => {
		castSend?.({ type: 'slide', index: currentIndex, step: 0 })
	}, [castSend, currentIndex])
	React.useEffect(() => {
		castSend?.({ type: 'blank', mode: blank })
	}, [castSend, blank])
	React.useEffect(() => {
		castSend?.({
			type: 'poll',
			counts: Object.fromEntries(voteCounts),
			total: totalVotes,
			winners: winningFrames
		})
	}, [castSend, voteCounts, totalVotes, winningFrames])
	const handlePointer = React.useCallback(
		(at: { x: number; y: number } | null) => castSend?.({ type: 'pointer', at }),
		[castSend]
	)

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

	// Track whether we're currently in browser fullscreen
	const [isInFullscreen, setIsInFullscreen] = React.useState(false)
	// Fullscreen asked for but refused (iOS, activation spent on the popup): use the windowed bar
	const [fsFailed, setFsFailed] = React.useState(false)
	const windowed = !fullscreen || fsFailed
	// External display found at start; the "Go fullscreen" retry targets it too
	const screenRef = React.useRef<Screen | null>(null)
	const onExitRef = React.useRef(onExit)
	onExitRef.current = onExit

	const requestFullscreen = React.useCallback((container: HTMLElement) => {
		const screen = screenRef.current
		// `screen` (Window Management API) is not in lib.dom's FullscreenOptions yet
		return container.requestFullscreen(
			screen ? ({ screen } as unknown as FullscreenOptions) : undefined
		)
	}, [])

	// Enter fullscreen on mount (only in fullscreen mode), on the external screen when found
	React.useEffect(() => {
		if (!fullscreen) return
		let cancelled = false
		let entered = false

		const enter = async () => {
			const container = containerRef.current
			if (!container?.requestFullscreen) {
				setFsFailed(true)
				return
			}
			screenRef.current = await getExternalScreen()
			if (cancelled) return
			try {
				await requestFullscreen(container)
				if (cancelled) {
					document.exitFullscreen().catch(() => {})
					return
				}
				entered = true
			} catch {
				if (!cancelled) setFsFailed(true)
			}
		}
		enter()

		// Exit presentation mode when leaving the fullscreen we entered (not the fallback's)
		const handleFullscreenChange = () => {
			if (entered && !document.fullscreenElement) onExitRef.current()
		}

		document.addEventListener('fullscreenchange', handleFullscreenChange)
		return () => {
			cancelled = true
			document.removeEventListener('fullscreenchange', handleFullscreenChange)
			if (document.fullscreenElement) {
				document.exitFullscreen().catch(() => {})
			}
		}
	}, [fullscreen, requestFullscreen])

	// Track fullscreen state changes for windowed mode's fullscreen toggle
	React.useEffect(() => {
		if (!windowed) return

		const handleFullscreenChange = () => {
			const inFS = !!document.fullscreenElement
			setIsInFullscreen(inFS)
			// If we exited fullscreen while in windowed mode, stay in windowed presentation
		}

		document.addEventListener('fullscreenchange', handleFullscreenChange)
		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange)
		}
	}, [windowed])

	// Toggle fullscreen from windowed mode
	const handleToggleFullscreen = React.useCallback(() => {
		const container = containerRef.current
		if (!container) return

		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {})
		} else if (typeof container.requestFullscreen === 'function') {
			requestFullscreen(container).catch(() => {})
		}
	}, [requestFullscreen])

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
				case 'f':
				case 'F':
					// Toggle fullscreen from windowed mode
					if (windowed && document.fullscreenEnabled) {
						e.preventDefault()
						handleToggleFullscreen()
					}
					break
				case 'b':
				case 'B':
				case 'w':
				case 'W': {
					// Blank the receiver black / white; the same key again shows the slide
					if (!castSend || e.ctrlKey || e.metaKey || e.altKey) break
					e.preventDefault()
					const mode: BlankMode = e.key === 'b' || e.key === 'B' ? 'black' : 'white'
					setBlank((cur) => (cur === mode ? null : mode))
					break
				}
				case 'n':
				case 'N':
					// Speaker notes drawer
					if (e.ctrlKey || e.metaKey || e.altKey) break
					e.preventDefault()
					setNotesOpen((open) => !open)
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
		handlePollClick,
		windowed,
		handleToggleFullscreen,
		castSend
	])

	// Show the controls; in fullscreen they hide again after CONTROLS_HIDE_MS
	const revealControls = React.useCallback(() => {
		setShowControls(true)
		if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
		if (!windowed) {
			hideTimeoutRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS)
		}
	}, [windowed])

	// Auto-hide controls after inactivity (only in fullscreen); a mouse move or a tap brings them back
	React.useEffect(() => {
		revealControls()
		if (windowed) return
		window.addEventListener('mousemove', revealControls)
		window.addEventListener('pointerdown', revealControls)
		return () => {
			window.removeEventListener('mousemove', revealControls)
			window.removeEventListener('pointerdown', revealControls)
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
		}
	}, [windowed, revealControls])

	const step = (delta: 1 | -1) =>
		handleIndexChange(Math.max(0, Math.min(currentIndex + delta, views.length - 1)))

	// Touch: swipe left/right navigates; the click that follows a swipe is swallowed
	const pointerStartRef = React.useRef<{ x: number; y: number; shown: boolean } | null>(null)
	const swipedRef = React.useRef(false)
	const handlePointerDown = (e: React.PointerEvent) => {
		swipedRef.current = false
		pointerStartRef.current = { x: e.clientX, y: e.clientY, shown: showControls }
	}
	const handlePointerUp = (e: React.PointerEvent) => {
		const start = pointerStartRef.current
		if (!start || isFollowing || e.pointerType === 'mouse') return
		const dir = isSwipe(e.clientX - start.x, e.clientY - start.y)
		if (!dir) return
		swipedRef.current = true
		step(dir === 'next' ? 1 : -1)
	}

	// Click to advance (disabled when following): halves, or thirds on touch (middle toggles controls)
	const handleClick = (e: React.MouseEvent) => {
		if (swipedRef.current) {
			swipedRef.current = false
			return
		}
		// When following, clicks do nothing (synced with presenter)
		if (isFollowing) return

		const rect = containerRef.current?.getBoundingClientRect()
		if (!rect) return
		const zone = tapZone(e.clientX - rect.left, rect.width, coarse)
		if (zone !== 'toggle') {
			step(zone === 'next' ? 1 : -1)
		} else if (pointerStartRef.current?.shown) {
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
			setShowControls(false)
		} else {
			revealControls()
		}
	}

	if (!currentView) return null

	const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

	const containerClass = [
		'c-presentation-container',
		windowed && 'windowed',
		!showControls && 'c-controls-hidden',
		isFollowing && 'following'
	]
		.filter(Boolean)
		.join(' ')

	return (
		<div
			ref={containerRef}
			onClick={handleClick}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			className={containerClass}
		>
			{castSend ? (
				<PresenterView
					doc={doc}
					views={views}
					currentIndex={currentIndex}
					onIndexChange={handleIndexChange}
					onExit={onExit}
					ownerTag={ownerTag}
					token={token}
					sourceFileId={sourceFileId}
					canWrite={prezillo.cloudillo.access === 'write'}
					onPointer={handlePointer}
				/>
			) : (
				/* Render ALL slide containers (stable keys), but only populate nearby ones */
				views.map((view, index) => {
					const isCurrentSlide = index === currentIndex
					const isNearby = Math.abs(index - currentIndex) <= 1
					return (
						<PresentationSlide
							key={view.id}
							view={view}
							doc={doc}
							ownerTag={ownerTag}
							token={token}
							sourceFileId={sourceFileId}
							isVisible={isCurrentSlide}
							renderContent={isNearby}
							voteCounts={isCurrentSlide ? voteCounts : undefined}
							totalVotes={isCurrentSlide ? totalVotes : undefined}
							winningFrames={isCurrentSlide ? winningFrames : undefined}
							myVote={isCurrentSlide ? myVote : undefined}
							onPollClick={isCurrentSlide && awareness ? handlePollClick : undefined}
							focusedPollId={isCurrentSlide ? focusedPollId : undefined}
							userCount={userCount}
							canWrite={prezillo.cloudillo.access === 'write'}
						/>
					)
				})
			)}

			{/* Speaker notes drawer (N); a collapsed tab stays when notes were asked for */}
			{!isFollowing && !castSend && (notesOpen || (withNotes && !popup)) && (
				<div
					className={`c-presentation-notes${notesOpen ? ' open' : ''}`}
					onClick={stopEvent}
					onPointerDown={stopEvent}
					onPointerUp={stopEvent}
				>
					<button
						className="c-presentation-notes__toggle"
						onClick={() => setNotesOpen((open) => !open)}
						aria-expanded={notesOpen}
					>
						{t('Speaker notes (N)')}
					</button>
					{notesOpen && <NotesText doc={doc} viewId={currentView.id} />}
				</div>
			)}

			{popup && !isFollowing && (
				<PresenterWindow
					win={popup}
					doc={doc}
					views={views}
					currentIndex={currentIndex}
					onIndexChange={handleIndexChange}
					onExit={onExit}
					ownerTag={ownerTag}
					token={token}
					sourceFileId={sourceFileId}
					canWrite={prezillo.cloudillo.access === 'write'}
				/>
			)}

			{/* Windowed mode (or refused fullscreen): persistent control bar */}
			{windowed && !castSend && (
				<div className="c-presentation-controls" onClick={(e) => e.stopPropagation()}>
					<button
						className="c-presentation-controls__btn"
						onClick={() =>
							!isFollowing && handleIndexChange(Math.max(currentIndex - 1, 0))
						}
						disabled={isFollowing || currentIndex <= 0}
						title={t('Previous slide')}
					>
						<IcPrev />
					</button>
					<span className="c-presentation-controls__counter">
						{currentIndex + 1} / {views.length}
					</span>
					<button
						className="c-presentation-controls__btn"
						onClick={() =>
							!isFollowing &&
							handleIndexChange(Math.min(currentIndex + 1, views.length - 1))
						}
						disabled={isFollowing || currentIndex >= views.length - 1}
						title={t('Next slide')}
					>
						<IcNext />
					</button>
					<div className="c-presentation-controls__spacer" />
					{document.fullscreenEnabled && (
						<button
							className="c-presentation-controls__btn"
							onClick={handleToggleFullscreen}
							title={isInFullscreen ? t('Exit fullscreen') : t('Fullscreen (F)')}
						>
							<IcFullscreen />
							{fsFailed && !isInFullscreen && <span>{t('Go fullscreen')}</span>}
						</button>
					)}
					<button
						className="c-presentation-controls__btn exit"
						onClick={onExit}
						title={t('Exit presentation (Esc)')}
					>
						<IcClose />
						<span>{t('Exit')}</span>
					</button>
				</div>
			)}

			{/* Fullscreen mode: overlay counter and exit button */}
			{!windowed && (
				<>
					<div className="c-presentation-counter">
						{currentIndex + 1} / {views.length}
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation()
							onExit()
						}}
						className="c-presentation-exit"
						title={t('Exit presentation (Esc)')}
					>
						<IcClose />
					</button>
				</>
			)}
		</div>
	)
}

// vim: ts=4
