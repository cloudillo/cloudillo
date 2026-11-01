// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Presenter view: current slide, next-slide preview, speaker notes and an elapsed timer.
 * `PresenterView` is the layout; `PresenterWindow` portals it into the presenter popup.
 */

import { IcClose, IcNext, IcPrev } from '@cloudillo/react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { ViewId, ViewNode, YPrezilloDocument } from '../crdt'
import { formatElapsed } from '../presenter'
import { PresentationSlide } from './PresentationMode'

/** Plain text of a slide's speaker notes, re-rendered on every change */
export function useViewNotes(doc: YPrezilloDocument, viewId: ViewId | undefined): string {
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		doc.vn.observe(rerender)
		return () => doc.vn.unobserve(rerender)
	}, [doc])
	const yText = viewId ? doc.vn.get(viewId) : undefined
	React.useEffect(() => {
		if (!yText) return
		yText.observe(rerender)
		return () => yText.unobserve(rerender)
	}, [yText])
	return yText?.toString() ?? ''
}

/** Read-only notes of the given slide */
export function NotesText({
	doc,
	viewId,
	fontSize
}: {
	doc: YPrezilloDocument
	viewId: ViewId | undefined
	fontSize?: number
}) {
	const { t } = useTranslation()
	const notes = useViewNotes(doc, viewId)
	return (
		<div className="c-presenter-notes" style={fontSize ? { fontSize } : undefined}>
			{notes.trim() ? (
				notes
			) : (
				<span className="c-presenter-notes__empty">{t('No notes')}</span>
			)}
		</div>
	)
}

function useStopwatch() {
	const [base, setBase] = React.useState(0)
	const [since, setSince] = React.useState<number | null>(() => Date.now())
	const [now, setNow] = React.useState(() => Date.now())
	React.useEffect(() => {
		if (since === null) return
		const id = setInterval(() => setNow(Date.now()), 500)
		return () => clearInterval(id)
	}, [since])
	const elapsed = base + (since === null ? 0 : Math.max(0, now - since))
	const toggle = () => {
		const t = Date.now()
		setNow(t)
		if (since === null) {
			setSince(t)
		} else {
			setBase(elapsed)
			setSince(null)
		}
	}
	const reset = () => {
		const t = Date.now()
		setBase(0)
		setNow(t)
		if (since !== null) setSince(t)
	}
	return { elapsed, running: since !== null, toggle, reset }
}

export interface PresenterViewProps {
	doc: YPrezilloDocument
	views: ViewNode[]
	currentIndex: number
	onIndexChange: (index: number) => void
	onExit: () => void
	ownerTag?: string
	token?: string
	sourceFileId?: string
	canWrite?: boolean
	/** Laser pointer over the current slide, normalised 0..1; null = off the slide */
	onPointer?: (at: { x: number; y: number } | null) => void
}

export function PresenterView({
	doc,
	views,
	currentIndex,
	onIndexChange,
	onExit,
	ownerTag,
	token,
	sourceFileId,
	canWrite,
	onPointer
}: PresenterViewProps) {
	const { t } = useTranslation()
	const timer = useStopwatch()
	const [fontSize, setFontSize] = React.useState(20)
	const current = views[currentIndex]
	const next = views[currentIndex + 1]
	const stop = (e: React.SyntheticEvent) => e.stopPropagation()
	// Laser pointer: the cursor over the current slide, normalised to it, sent once per frame
	const pointerFrameRef = React.useRef(0)
	const pointerAtRef = React.useRef<{ x: number; y: number } | null>(null)
	// The popup's own window: the opener's rAF pauses while it is occluded
	const pointerWinRef = React.useRef<Window | null>(null)
	React.useEffect(
		() => () => pointerWinRef.current?.cancelAnimationFrame(pointerFrameRef.current),
		[]
	)
	const movePointer = (e: React.PointerEvent<HTMLDivElement>) => {
		const box = e.currentTarget.querySelector('svg')?.getBoundingClientRect()
		if (!onPointer || !box?.width || !box.height || !current?.width || !current.height) return
		// The viewBox letterboxes the slide (xMidYMid meet): normalise to the fitted slide rect
		const s = Math.min(box.width / current.width, box.height / current.height)
		const left = box.left + (box.width - current.width * s) / 2
		const top = box.top + (box.height - current.height * s) / 2
		const x = (e.clientX - left) / (current.width * s)
		const y = (e.clientY - top) / (current.height * s)
		pointerAtRef.current = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
		if (pointerFrameRef.current) return
		const win = e.currentTarget.ownerDocument.defaultView ?? window
		pointerWinRef.current = win
		pointerFrameRef.current = win.requestAnimationFrame(() => {
			pointerFrameRef.current = 0
			onPointer(pointerAtRef.current)
		})
	}
	const hidePointer = () => {
		pointerWinRef.current?.cancelAnimationFrame(pointerFrameRef.current)
		pointerFrameRef.current = 0
		onPointer?.(null)
	}

	return (
		<div className="c-presenter" onClick={stop} onPointerDown={stop} onPointerUp={stop}>
			<div
				className="c-presenter__current"
				onPointerMove={onPointer ? movePointer : undefined}
				onPointerLeave={onPointer ? hidePointer : undefined}
			>
				{current && (
					<PresentationSlide
						view={current}
						doc={doc}
						ownerTag={ownerTag}
						token={token}
						sourceFileId={sourceFileId}
						canWrite={canWrite}
						isVisible
					/>
				)}
			</div>
			<div className="c-presenter__side">
				<div className="c-presenter__label">{t('Next slide')}</div>
				<div className="c-presenter__next">
					{next ? (
						<PresentationSlide
							view={next}
							doc={doc}
							ownerTag={ownerTag}
							token={token}
							sourceFileId={sourceFileId}
							isVisible
							thumbnail
						/>
					) : (
						<span className="c-presenter-notes__empty">{t('End of presentation')}</span>
					)}
				</div>
				<div className="c-presenter__label c-presenter__row">
					<span>{t('Notes')}</span>
					<span className="c-presenter__spacer" />
					<button
						className="c-button sm"
						onClick={() => setFontSize((s) => Math.max(12, s - 2))}
						aria-label={t('Smaller text')}
					>
						A−
					</button>
					<button
						className="c-button sm"
						onClick={() => setFontSize((s) => Math.min(48, s + 2))}
						aria-label={t('Larger text')}
					>
						A+
					</button>
				</div>
				<NotesText doc={doc} viewId={current?.id} fontSize={fontSize} />
			</div>
			<div className="c-presenter__bar">
				<span className="c-presenter__timer" role="timer">
					{formatElapsed(timer.elapsed)}
				</span>
				<button className="c-button sm" onClick={timer.toggle}>
					{timer.running ? t('Pause') : t('Resume')}
				</button>
				<button className="c-button sm" onClick={timer.reset}>
					{t('Reset')}
				</button>
				<span className="c-presenter__spacer" />
				<button
					className="c-button icon"
					onClick={() => onIndexChange(Math.max(currentIndex - 1, 0))}
					disabled={currentIndex <= 0}
					title={t('Previous slide')}
					aria-label={t('Previous slide')}
				>
					<IcPrev />
				</button>
				<span className="c-presenter__counter">
					{currentIndex + 1} / {views.length}
				</span>
				<button
					className="c-button icon"
					onClick={() => onIndexChange(Math.min(currentIndex + 1, views.length - 1))}
					disabled={currentIndex >= views.length - 1}
					title={t('Next slide')}
					aria-label={t('Next slide')}
				>
					<IcNext />
				</button>
				<span className="c-presenter__spacer" />
				<button className="c-button sm" onClick={onExit}>
					<IcClose />
					<span>{t('End presentation')}</span>
				</button>
			</div>
		</div>
	)
}

/** `PresenterView` portalled into the presenter popup, with the popup's own keyboard */
export function PresenterWindow({ win, ...props }: PresenterViewProps & { win: Window }) {
	const { currentIndex, views, onIndexChange, onExit } = props
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowRight':
				case 'ArrowDown':
				case 'PageDown':
					e.preventDefault()
					onIndexChange(Math.min(currentIndex + 1, views.length - 1))
					break
				case ' ':
					// A focused button/link activates on Space; don't also advance.
					// `closest`, not `instanceof`: the target lives in the popup's window
					if ((e.target as Element | null)?.closest?.('button, a, [role="button"]'))
						return
					e.preventDefault()
					onIndexChange(Math.min(currentIndex + 1, views.length - 1))
					break
				case 'ArrowLeft':
				case 'ArrowUp':
				case 'PageUp':
					e.preventDefault()
					onIndexChange(Math.max(currentIndex - 1, 0))
					break
				case 'Escape':
					e.preventDefault()
					onExit()
					break
			}
		}
		win.addEventListener('keydown', handleKeyDown)
		return () => win.removeEventListener('keydown', handleKeyDown)
	}, [win, currentIndex, views.length, onIndexChange, onExit])

	return createPortal(<PresenterView {...props} />, win.document.body)
}

// vim: ts=4
