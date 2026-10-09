// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Sizes an embedded view's iframe from the source's report and the host's settings, tells the
 * source the layout to render at, and owns view-mode / interact-mode switching.
 *
 * Layout is (re)sent whenever the computed payload changes — JSON-deduped, so a report that
 * leaves the frame unchanged sends nothing. Sources report `natural` unscaled, which keeps
 * this loop-free.
 */

import {
	type EmbedViewLayoutPayload,
	type EmbedViewReportPayload,
	MAX_NATURAL
} from '@cloudillo/core'
import * as React from 'react'

import { DocumentEmbedIframe, type DocumentEmbedIframeRef } from '../DocumentEmbed/index.js'
import { useEscapeKey } from '../hooks.js'
import { mergeClasses } from '../utils.js'
import {
	clampLayoutScale,
	clampNatural,
	computeEmbedFrame,
	type EmbedViewSettings
} from './sizing.js'

export interface ViewEmbedFrameProps {
	src: string
	settings: EmbedViewSettings
	/** Frame size in `box` sizing mode */
	box?: { w: number; h: number }
	/** Accessible name until the source reports its own `a11yLabel` */
	label: string
	/** The viewer may edit the source in place (host decides); false = never activates */
	canInteract: boolean
	/** Host keeps the embed in interact mode regardless of user activation */
	active?: boolean
	onReport?: (report: EmbedViewReportPayload) => void
	onAppReady?: (stage?: string) => void
	onAppError?: (code: number, message?: string) => void
	/** Interact mode switched on or off */
	onActiveChange?: (active: boolean) => void
	/** The source asked to leave interact mode (Esc) while the host forces it */
	onExitForced?: () => void
	/** The iframe document loaded; the app inside may still be booting */
	onFrameLoad?: () => void
	/** Host keeps the embed selected (e.g. a selected canvas object) */
	selected?: boolean
	/** Host editor: the bar also shows while the host forces interact mode */
	canEdit?: boolean
	/** Show a resize handle when selected; `onResize` gets the dragged frame width */
	resizable?: boolean
	onResize?: (frameW: number, availW: number) => void
	/** Delete / Backspace while selected */
	onDelete?: () => void
	className?: string
	/** Overlay (chrome) rendered inside the frame container */
	children?: React.ReactNode
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

export interface ViewEmbedFrameHandle {
	/** Ask the source to show a view (`embed:view.set`) */
	setNav: (nav?: string) => void
	/** Enter interact mode */
	activate: () => void
	/** Leave interact mode and return focus to the container */
	deactivate: () => void
}

export const ViewEmbedFrame = React.forwardRef<ViewEmbedFrameHandle, ViewEmbedFrameProps>(
	function ViewEmbedFrame(
		{
			src,
			settings,
			box,
			label,
			canInteract,
			active: forceActive = false,
			onReport,
			onAppReady,
			onAppError,
			onActiveChange,
			onExitForced,
			onFrameLoad,
			selected: forceSelected = false,
			canEdit = false,
			resizable = false,
			onResize,
			onDelete,
			className,
			children
		},
		ref
	) {
		const lineRef = React.useRef<HTMLDivElement>(null)
		const containerRef = React.useRef<HTMLDivElement>(null)
		const iframeRef = React.useRef<DocumentEmbedIframeRef>(null)
		const [availW, setAvailW] = React.useState(0)
		const [report, setReport] = React.useState<EmbedViewReportPayload>()
		const [userActive, setUserActive] = React.useState(false)
		const [userSelected, setUserSelected] = React.useState(false)
		const [dragW, setDragW] = React.useState<number>()
		const [barBelow, setBarBelow] = React.useState(false)
		const active = forceActive || userActive
		// While the host forces interact mode, clicks belong to the iframe
		const selected = forceSelected || (userSelected && !forceActive)
		const barVisible = selected || userActive || (forceActive && canEdit)
		const align = settings.align ?? 'left'

		React.useLayoutEffect(function measureWidth() {
			const el = lineRef.current
			if (!el) return
			const measure = () => setAvailW(el.clientWidth)
			measure()
			const ro = new ResizeObserver(measure)
			ro.observe(el)
			return () => ro.disconnect()
		}, [])

		const lastNatural = settings.lastNatural
		const natural =
			report?.natural ?? (lastNatural ? { w: lastNatural[0], h: lastNatural[1] } : undefined)
		const kind = report?.kind ?? 'fixed'
		const computed = computeEmbedFrame({
			sizing: settings.sizing,
			kind,
			natural,
			availW,
			box,
			scale: settings.scale,
			maxH: settings.maxH,
			width: settings.width,
			missing: report?.missing
		})
		// Live drag preview: a fixed view scales with locked aspect, a reflow view only narrows
		const frame =
			dragW === undefined || computed.w <= 0
				? computed
				: kind === 'fixed'
					? {
							...computed,
							w: dragW,
							h: Math.round((computed.h * dragW) / computed.w),
							scale: (computed.scale * dragW) / computed.w
						}
					: { ...computed, w: dragW }
		// Capped reflow content: the iframe takes its full height and the frame scrolls it
		const iframeH = frame.innerScroll
			? Math.max(frame.h, clampNatural(natural ?? { w: 0, h: 0 }).h)
			: undefined

		const layout: EmbedViewLayoutPayload = {
			sizing: settings.sizing,
			// Only the wire values are bounded (a huge frame at 4x scale passes MAX_NATURAL); an
			// out-of-range one drops the whole layout
			availW: Math.min(frame.w, MAX_NATURAL),
			availH: Math.min(frame.h, MAX_NATURAL),
			scale: clampLayoutScale(frame.scale),
			textScale:
				settings.textScale === undefined ? undefined : clampLayoutScale(settings.textScale),
			interactive: active
		}
		const layoutKey = JSON.stringify(layout)
		const layoutRef = React.useRef(layout)
		layoutRef.current = layout

		React.useEffect(
			function sendLayout() {
				if (availW > 0) iframeRef.current?.sendLayout(layoutRef.current)
			},
			[layoutKey]
		)

		const handleAppReady = React.useCallback(
			(stage?: string) => {
				// The child may not have been listening when the layout was first sent
				if (layoutRef.current.availW > 0) iframeRef.current?.sendLayout(layoutRef.current)
				onAppReady?.(stage)
			},
			[onAppReady]
		)

		const handleReport = React.useCallback(
			(r: EmbedViewReportPayload) => {
				setReport(r)
				onReport?.(r)
			},
			[onReport]
		)

		const activeRef = React.useRef(false)
		const setActiveState = React.useCallback(
			(next: boolean) => {
				if (activeRef.current === next) return
				activeRef.current = next
				setUserActive(next)
				onActiveChange?.(next)
			},
			[onActiveChange]
		)

		const activate = React.useCallback(() => {
			if (!canInteract) return
			setActiveState(true)
			// After the re-render that makes the iframe focusable
			requestAnimationFrame(() => iframeRef.current?.focus())
		}, [canInteract, setActiveState])
		const deactivate = React.useCallback(() => {
			setActiveState(false)
			containerRef.current?.focus()
		}, [setActiveState])

		useEscapeKey(deactivate, userActive)

		const handleExit = React.useCallback(() => {
			if (activeRef.current) deactivate()
			else if (forceActive) onExitForced?.()
		}, [deactivate, forceActive, onExitForced])

		const selectedNow = forceSelected || userSelected || userActive
		React.useEffect(
			function deselectOutside() {
				if (!(userSelected || userActive)) return
				function onMouseDown(evt: MouseEvent) {
					const t = evt.target
					if (!(t instanceof Element)) return
					// Popovers and menus opened from the bar are portalled out of the container
					if (containerRef.current?.contains(t) || t.closest('.c-popper')) return
					// Focus stays where the user clicked
					setActiveState(false)
					setUserSelected(false)
				}
				document.addEventListener('mousedown', onMouseDown)
				return () => document.removeEventListener('mousedown', onMouseDown)
			},
			[userSelected, userActive, setActiveState]
		)

		React.useLayoutEffect(
			function placeBar() {
				const el = containerRef.current
				if (!barVisible || !el) return
				const barH = el.querySelector<HTMLElement>('.cl-embed-chrome')?.offsetHeight || 32
				let top = 0
				for (let p = el.parentElement; p; p = p.parentElement) {
					if (getComputedStyle(p).overflowY !== 'visible') {
						top = p.getBoundingClientRect().top
						break
					}
				}
				setBarBelow(el.getBoundingClientRect().top - top < barH + 8)
			},
			[barVisible]
		)

		React.useImperativeHandle(
			ref,
			() => ({
				setNav: (nav?: string) => iframeRef.current?.sendViewSet(nav),
				activate,
				deactivate
			}),
			[activate, deactivate]
		)

		function onKeyDown(evt: React.KeyboardEvent<HTMLDivElement>) {
			if (evt.target !== evt.currentTarget || active) return
			if (evt.key === 'Enter') {
				activate()
			} else if (evt.key === 'Escape' && userSelected) {
				setUserSelected(false)
			} else if ((evt.key === 'Delete' || evt.key === 'Backspace') && selected && onDelete) {
				onDelete()
			} else {
				return
			}
			// Keep host editors (Quill's keyboard module) from also acting on the key
			evt.preventDefault()
			evt.stopPropagation()
		}

		function select() {
			if (!forceActive && !userSelected) setUserSelected(true)
		}

		function onHandleDown(evt: React.PointerEvent<HTMLButtonElement>) {
			evt.preventDefault()
			evt.stopPropagation()
			const handle = evt.currentTarget
			handle.setPointerCapture(evt.pointerId)
			const startX = evt.clientX
			const startW = frame.w
			// Centered frames grow on both sides; right-aligned ones grow to the left
			const factor = (align === 'right' ? -1 : 1) * (align === 'center' ? 2 : 1)
			let w = startW
			const move = (e: PointerEvent) => {
				w = Math.round(
					Math.min(availW, Math.max(40, startW + (e.clientX - startX) * factor))
				)
				setDragW(w)
			}
			const up = () => {
				handle.removeEventListener('pointermove', move)
				handle.removeEventListener('pointerup', up)
				handle.removeEventListener('pointercancel', up)
				setDragW(undefined)
				if (w !== startW) onResize?.(w, availW)
			}
			handle.addEventListener('pointermove', move)
			handle.addEventListener('pointerup', up)
			handle.addEventListener('pointercancel', up)
		}

		const name = report?.a11yLabel || label

		// DocumentEmbedIframe has no `title` prop yet; set it on the element directly
		React.useEffect(
			function titleIframe() {
				containerRef.current?.querySelector('iframe')?.setAttribute('title', name)
			},
			[name]
		)

		const badge =
			dragW === undefined
				? undefined
				: kind === 'fixed'
					? Math.round(frame.scale * 100)
					: Math.round((dragW / Math.max(1, availW)) * 100)

		return (
			<div
				ref={lineRef}
				className="cl-view-embed-line"
				style={{ justifyContent: JUSTIFY[align] }}
			>
				<div
					ref={containerRef}
					className={mergeClasses(
						'cl-view-embed',
						selectedNow && 'selected',
						active && 'active',
						barVisible && 'bar',
						className
					)}
					style={{ width: frame.w }}
					role="group"
					aria-label={name}
					tabIndex={0}
					data-editable={canInteract || undefined}
					data-bar={barBelow ? 'below' : undefined}
					onDoubleClick={active ? undefined : activate}
					onKeyDown={onKeyDown}
					onPointerDown={select}
					onFocus={select}
				>
					<div
						className="cl-view-embed-frame"
						style={{
							width: frame.w,
							height: frame.h,
							overflowY: frame.innerScroll ? 'auto' : undefined
						}}
					>
						{/* Always wrapped, so toggling innerScroll never remounts (reloads) the iframe */}
						<div style={{ height: iframeH ?? '100%' }}>
							<DocumentEmbedIframe
								ref={iframeRef}
								src={src}
								className="cl-view-embed-iframe"
								active={active}
								onLoad={onFrameLoad}
								onExit={handleExit}
								onAppReady={handleAppReady}
								onAppError={onAppError}
								onViewReport={handleReport}
							/>
						</div>
					</div>
					{children}
					{resizable && selected && !active && (
						<button
							type="button"
							className={mergeClasses(
								'cl-view-embed-handle',
								kind,
								align === 'right' && 'left'
							)}
							aria-hidden="true"
							tabIndex={-1}
							onPointerDown={onHandleDown}
						/>
					)}
					{badge !== undefined && <span className="cl-view-embed-badge">{badge}%</span>}
				</div>
			</div>
		)
	}
)

// vim: ts=4
