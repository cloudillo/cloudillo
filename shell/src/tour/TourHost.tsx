// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The guided tour: a passive walkthrough that spotlights one shell element per step.
 * A `SpotlightOverlay` makes the page inert; only the bubble's buttons, ←/→ and Esc work.
 * The tour opens Feed and Files itself (in the current context) and returns to where it started.
 */

import {
	ActionBar,
	Button,
	Dialog,
	HBox,
	Heading,
	mergeClasses,
	SpotlightOverlay,
	Text,
	useAnchoredPosition,
	useIsDesktop,
	VBox,
	type VirtualAnchor
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { useCtx } from '../context/ctx.js'
import { tourAtom, useStartTour } from './atoms.js'
import { bubbleLayout, findTourTarget, type TourStep, tourSteps } from './steps.js'

import './tour.css'

/** Gap between the target and the spotlight's edge */
const PAD = 4
/** How long a step waits for its target before falling back to centered */
const TARGET_TIMEOUT_MS = 1500
/** How long the spotlight rests on the app icon before the tour opens that page */
const VIA_MS = 1200

export function TourHost() {
	const { t } = useTranslation()
	const { base } = useCtx()
	const [tour, setTour] = useAtom(tourAtom)
	const startTour = useStartTour()
	// Stable: the overlay's navigation effect depends on it
	const close = React.useCallback(() => setTour(null), [setTour])
	const steps = React.useMemo(() => tourSteps(t, base), [t, base])

	if (tour === 'offer') {
		return (
			<Dialog
				open
				title={t('Take a quick tour?')}
				description={t('See where things are in Cloudillo. It takes about a minute.')}
				onClose={close}
				footer={
					<ActionBar>
						<Button onClick={close}>{t('Not now')}</Button>
						<Button color="primary" autoFocus onClick={startTour}>
							{t('Start')}
						</Button>
					</ActionBar>
				}
			/>
		)
	}
	if (!tour) return null

	return (
		<TourOverlay
			steps={steps}
			step={tour.step}
			onGo={(next) => setTour({ step: next })}
			onClose={close}
		/>
	)
}

interface TourOverlayProps {
	steps: TourStep[]
	step: number
	onGo: (step: number) => void
	/** End the tour; history is already settled */
	onClose: () => void
}

function TourOverlay({ steps, step, onGo, onClose }: TourOverlayProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const isDesktop = useIsDesktop('lg')
	const current = steps[step]
	const isLast = step === steps.length - 1
	const titleId = React.useId()
	const bodyId = React.useId()
	const nextRef = React.useRef<HTMLButtonElement>(null)
	const [bubbleEl, setBubbleEl] = React.useState<HTMLDivElement | null>(null)
	// The step that has reached its page (known from the pathname, not from navigate()).
	const [arrived, setArrived] = React.useState<number | null>(null)
	// History: the tour pushes one entry when it first leaves the start page and replaces it
	// after that, so finishing is a single pop back to the user's untouched start entry.
	const at = React.useRef(pathname)
	const pending = React.useRef<string | null>(null)
	const pushed = React.useRef(false)
	// Keyed by step, so a step change never renders against the previous step's target.
	const [found, setFound] = React.useState<{ step: number; el: Element | null } | null>(null)
	// undefined: still looking; null: none (centered)
	const target = found?.step === step ? found.el : undefined
	const [measured, setMeasured] = React.useState<{ el: Element; rect: DOMRect } | null>(null)
	// The app icon the spotlight rests on before a step changes page
	const [via, setVia] = React.useState<Element | null>(null)

	function done() {
		if (pushed.current) navigate(-1)
		onClose()
	}
	const next = () => (isLast ? done() : onGo(step + 1))
	const back = step > 0 ? () => onGo(step - 1) : undefined

	// Point at the app's icon first, so the page change has a visible cause.
	React.useEffect(() => {
		if (pathname === pending.current) {
			at.current = pathname
			pending.current = null
		} else if (pathname !== at.current) {
			// A page change the tour did not make (Back/Forward): the user took over, end quietly.
			onClose()
			return
		}
		const route = current?.route
		if (!route || pathname === route) {
			setArrived(step)
			return
		}
		if (pending.current === route) return
		const go = () => {
			pending.current = route
			navigate(route, { replace: pushed.current })
			pushed.current = true
		}
		const link = findTourTarget('nav')?.querySelector(`a[href="${CSS.escape(route)}"]`)
		if (!link || link.getClientRects().length === 0) {
			go()
			return
		}
		setVia(link)
		const timer = setTimeout(() => {
			setVia(null)
			go()
		}, VIA_MS)
		return () => {
			clearTimeout(timer)
			setVia(null)
		}
	}, [step, current, pathname, navigate, onClose])

	// The target may mount late (route change, lazy page): poll for it. After the timeout the
	// bubble shows centered, but polling goes on so a late lazy chunk still gets the spotlight.
	React.useEffect(() => {
		// Wait for the step's page; the timeout must not run out on the way there.
		if (arrived !== step || target) return
		const id = current?.target
		if (!id) {
			setFound({ step, el: null })
			return
		}
		const until = performance.now() + TARGET_TIMEOUT_MS
		let timedOut = target !== undefined
		let raf = 0
		// rAF poll until found; MutationObserver if this ever shows in profiles
		const poll = () => {
			const el = findTourTarget(id)
			if (el) {
				setFound({ step, el })
				return
			}
			if (!timedOut && performance.now() > until) {
				timedOut = true
				setFound({ step, el: null })
			}
			raf = requestAnimationFrame(poll)
		}
		poll()
		return () => cancelAnimationFrame(raf)
	}, [arrived, step, current, target])

	const shown = via ?? target
	React.useLayoutEffect(() => {
		if (!shown) return
		shown.scrollIntoView({ block: 'nearest' })
		const update = () => {
			// The page re-rendered the target: look it up again instead of measuring a ghost.
			// Clearing the target restarts the poll.
			if (!shown.isConnected) {
				if (shown !== via) setFound({ step, el: null })
				return
			}
			setMeasured({ el: shown, rect: shown.getBoundingClientRect() })
		}
		update()
		const ro = new ResizeObserver(update)
		ro.observe(shown)
		window.addEventListener('resize', update)
		window.addEventListener('scroll', update, true)
		return () => {
			ro.disconnect()
			window.removeEventListener('resize', update)
			window.removeEventListener('scroll', update, true)
		}
	}, [shown, via, step])
	// No spot shown and still looking: stay on the last spot rather than flashing to center.
	const rect = shown
		? measured?.el === shown
			? measured.rect
			: null
		: target === undefined
			? (measured?.rect ?? null)
			: null

	function onKeyDown(evt: React.KeyboardEvent) {
		const go = evt.key === 'ArrowLeft' ? back : evt.key === 'ArrowRight' ? next : undefined
		if (!go) return
		evt.preventDefault()
		go()
	}

	// Refocus Next on every step
	React.useEffect(() => {
		nextRef.current?.focus({ preventScroll: true })
	}, [step])

	// After the dialog's own focus restore: the opener (offer dialog / menu item) is gone; land on
	// the menu the tour can be restarted from.
	React.useEffect(
		() => () => {
			requestAnimationFrame(() => {
				const active = document.activeElement
				if (active && active !== document.body) return
				findTourTarget('user-menu')?.querySelector<HTMLElement>('button')?.focus()
			})
		},
		[]
	)

	const spot = React.useMemo(
		() =>
			rect && {
				top: rect.top - PAD,
				left: rect.left - PAD,
				width: rect.width + 2 * PAD,
				height: rect.height + 2 * PAD
			},
		[rect]
	)
	// A fresh anchor object per rect makes popper recompute when the target moves.
	const anchor = React.useMemo<VirtualAnchor | null>(
		() =>
			spot && {
				getBoundingClientRect: () =>
					new DOMRect(spot.left, spot.top, spot.width, spot.height)
			},
		[spot]
	)
	const floating = isDesktop && !!anchor
	const { placement, mode } = bubbleLayout(rect, floating, window.innerWidth, window.innerHeight)
	const { style, attributes } = useAnchoredPosition(
		floating ? anchor : null,
		floating ? bubbleEl : null,
		{ placement, offset: 12 }
	)

	if (!current) return null

	return (
		<SpotlightOverlay
			open
			spot={spot}
			onClose={done}
			aria-labelledby={titleId}
			aria-describedby={bodyId}
			onKeyDown={onKeyDown}
		>
			<VBox
				ref={setBubbleEl}
				className={mergeClasses('c-tour-bubble p-3', mode)}
				style={floating ? style : undefined}
				{...(floating ? attributes : undefined)}
			>
				{/* Focus stays on Next, so announce each step's text */}
				<VBox aria-live="polite" aria-atomic="true">
					<Heading level={2} size="lg" id={titleId}>
						{current.title}
					</Heading>
					<Text as="p" id={bodyId} className="my-2">
						{current.body}
					</Text>
				</VBox>
				<HBox gap={1} align="center">
					<Text size="sm" emphasis="muted" className="flex-fill">
						{t('Step {{current}} of {{total}}', {
							current: step + 1,
							total: steps.length
						})}
					</Text>
					{!isLast && (
						<Button variant="ghost" onClick={done}>
							{t('Skip')}
						</Button>
					)}
					{back && <Button onClick={back}>{t('Back')}</Button>}
					<Button ref={nextRef} color="primary" onClick={next}>
						{isLast ? t('Finish') : t('Next')}
					</Button>
				</HBox>
			</VBox>
		</SpotlightOverlay>
	)
}

// vim: ts=4
