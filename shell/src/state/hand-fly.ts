// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import type { FileHandItem } from './hand.js'

export const handTargetElAtom = atom<HTMLElement | null>(null)

const MAX_PARALLEL = 3
const STAGGER_PICKUP_MS = 50
const STAGGER_DEPOSIT_MS = 40
const FLIGHT_DURATION_MS = 450
const FLIGHT_EASING = 'cubic-bezier(0.45, 0.05, 0.25, 1.15)'
const PULSE_CLASS = 'c-hand-chip-pulse'
const WAVE_CLASS = 'c-hand-chip-wave'
// Rows might not be in the DOM on the very first deposit frame (post-refresh
// list is still hydrating). Two passes across animation frames is enough.
const ROW_RESOLUTION_RETRY_PASSES = 2

function truncateLabel(label: string, max = 16): string {
	if (label.length <= max) return label
	return label.slice(0, max - 1) + '…'
}

function findRowElement(item: FileHandItem): HTMLElement | null {
	// Scoped to (fileId, sourceContext) — the same fileId can legitimately
	// appear in multiple listings under cross-context browsing, and the
	// unscoped fallback would resolve to the wrong row.
	const sel = `[data-file-id="${CSS.escape(item.id)}"][data-source-context="${CSS.escape(item.sourceContext)}"]`
	const el = document.querySelector(sel)
	return el instanceof HTMLElement ? el : null
}

function findIconSvg(row: HTMLElement): SVGElement | null {
	const svg = row.querySelector('svg')
	return svg instanceof SVGElement ? svg : null
}

function buildGhost(opts: {
	label: string
	iconSvg: SVGElement | null
	more?: number
}): HTMLDivElement {
	const ghost = document.createElement('div')
	ghost.className = 'cl-hand-ghost'
	if (opts.more !== undefined) {
		ghost.classList.add('cl-hand-ghost--more')
		ghost.textContent = `+${opts.more}`
	} else {
		if (opts.iconSvg) {
			const iconSpan = document.createElement('span')
			iconSpan.className = 'cl-hand-ghost__icon'
			const cloned = opts.iconSvg.cloneNode(true) as SVGElement
			cloned.removeAttribute('width')
			cloned.removeAttribute('height')
			cloned.style.width = '100%'
			cloned.style.height = '100%'
			iconSpan.appendChild(cloned)
			ghost.appendChild(iconSpan)
		}
		const labelSpan = document.createElement('span')
		labelSpan.className = 'cl-hand-ghost__label'
		labelSpan.textContent = truncateLabel(opts.label)
		ghost.appendChild(labelSpan)
	}
	ghost.style.position = 'fixed'
	ghost.style.left = '0'
	ghost.style.top = '0'
	ghost.style.pointerEvents = 'none'
	ghost.style.willChange = 'transform, opacity'
	ghost.style.zIndex = '9999'
	return ghost
}

function rectCenter(r: DOMRect): { x: number; y: number } {
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function animateGhost(
	ghost: HTMLDivElement,
	from: { x: number; y: number },
	to: { x: number; y: number }
): Animation {
	const midX = (from.x + to.x) / 2
	const midY = (from.y + to.y) / 2 - 24
	return ghost.animate(
		[
			{
				transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(1)`,
				opacity: 1
			},
			{
				transform: `translate(${midX}px, ${midY}px) translate(-50%, -50%) scale(0.6)`,
				opacity: 0.95,
				offset: 0.6
			},
			{
				transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(0.18)`,
				opacity: 0
			}
		],
		{ duration: FLIGHT_DURATION_MS, easing: FLIGHT_EASING, fill: 'forwards' }
	)
}

function retriggerClass(el: HTMLElement, cls: string, durationMs: number): void {
	el.classList.remove(cls)
	// Force a reflow so the animation re-runs even if the class was just removed.
	void el.offsetWidth
	el.classList.add(cls)
	window.setTimeout(() => {
		el.classList.remove(cls)
	}, durationMs)
}

export function pulseHand(target: HTMLElement): void {
	retriggerClass(target, PULSE_CLASS, 320)
}

export function waveHand(target: HTMLElement): void {
	retriggerClass(target, WAVE_CLASS, 420)
}

export function flyToHand(opts: {
	items: FileHandItem[]
	target: HTMLElement
	reducedMotion?: boolean
}): Promise<void> {
	const { items, target, reducedMotion } = opts
	if (items.length === 0) return Promise.resolve()
	if (reducedMotion) {
		pulseHand(target)
		return Promise.resolve()
	}

	const targetCenter = rectCenter(target.getBoundingClientRect())
	const flyers = items.slice(0, MAX_PARALLEL)
	const overflow = items.length - flyers.length

	type Plan = { ghost: HTMLDivElement; from: { x: number; y: number }; delay: number }
	const plans: Plan[] = []

	flyers.forEach((item, i) => {
		const row = findRowElement(item)
		if (!row) return
		const from = rectCenter(row.getBoundingClientRect())
		const iconSvg = findIconSvg(row)
		const ghost = buildGhost({ label: item.label, iconSvg })
		plans.push({ ghost, from, delay: i * STAGGER_PICKUP_MS })
	})

	if (overflow > 0) {
		const lastRow =
			findRowElement(items[flyers.length - 1]) ?? findRowElement(items[items.length - 1])
		const from = lastRow
			? rectCenter(lastRow.getBoundingClientRect())
			: { x: targetCenter.x, y: targetCenter.y + 80 }
		const ghost = buildGhost({ label: '', iconSvg: null, more: overflow })
		plans.push({ ghost, from, delay: flyers.length * STAGGER_PICKUP_MS })
	}

	if (plans.length === 0) {
		pulseHand(target)
		return Promise.resolve()
	}

	return new Promise<void>((resolve) => {
		let remaining = plans.length
		plans.forEach((plan) => {
			document.body.appendChild(plan.ghost)
			window.setTimeout(() => {
				const anim = animateGhost(plan.ghost, plan.from, targetCenter)
				const cleanup = () => {
					plan.ghost.remove()
					remaining -= 1
					if (remaining === 0) {
						pulseHand(target)
						resolve()
					}
				}
				anim.onfinish = cleanup
				anim.oncancel = cleanup
			}, plan.delay)
		})
	})
}

export function flyFromHand(opts: {
	items: FileHandItem[]
	source: HTMLElement
	reducedMotion?: boolean
}): Promise<void> {
	const { items, source, reducedMotion } = opts
	if (items.length === 0) return Promise.resolve()
	if (reducedMotion) return Promise.resolve()

	// Capture the source rect now, before the caller flips the hand to dormant
	// and React detaches this element — a detached node's getBoundingClientRect
	// collapses to (0,0) and ghosts would launch from the top-left corner.
	const sourceCenter = rectCenter(source.getBoundingClientRect())

	return new Promise<void>((resolve) => {
		const attempt = (tries: number) => {
			const flyers = items.slice(0, MAX_PARALLEL)
			const overflow = items.length - flyers.length

			type Plan = { ghost: HTMLDivElement; to: { x: number; y: number }; delay: number }
			const plans: Plan[] = []

			flyers.forEach((item, i) => {
				const row = findRowElement(item)
				if (!row) return
				const to = rectCenter(row.getBoundingClientRect())
				const iconSvg = findIconSvg(row)
				const ghost = buildGhost({ label: item.label, iconSvg })
				plans.push({ ghost, to, delay: i * STAGGER_DEPOSIT_MS })
			})

			if (overflow > 0) {
				const ghost = buildGhost({ label: '', iconSvg: null, more: overflow })
				const lastTarget =
					plans.length > 0
						? plans[plans.length - 1].to
						: { x: sourceCenter.x, y: sourceCenter.y + 80 }
				plans.push({
					ghost,
					to: lastTarget,
					delay: flyers.length * STAGGER_DEPOSIT_MS
				})
			}

			if (plans.length === 0) {
				if (tries > 0) {
					requestAnimationFrame(() => requestAnimationFrame(() => attempt(tries - 1)))
				} else {
					resolve()
				}
				return
			}

			let remaining = plans.length
			plans.forEach((plan) => {
				document.body.appendChild(plan.ghost)
				window.setTimeout(() => {
					const anim = animateGhost(plan.ghost, sourceCenter, plan.to)
					const cleanup = () => {
						plan.ghost.remove()
						remaining -= 1
						if (remaining === 0) resolve()
					}
					anim.onfinish = cleanup
					anim.oncancel = cleanup
				}, plan.delay)
			})
		}
		attempt(ROW_RESOLUTION_RETRY_PASSES)
	})
}

export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// vim: ts=4
