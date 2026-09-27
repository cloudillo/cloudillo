// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import { useEscapeKey } from '../hooks.js'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface UseTooltipOptions {
	/** Nothing is rendered while empty */
	content: React.ReactNode
	/** Defaults to `top`; flips when out of room */
	placement?: TooltipPlacement
	/**
	 * Point the trigger's `aria-describedby` at the tooltip (default true). Turn off
	 * when the content only repeats the trigger's accessible name.
	 */
	describe?: boolean
	disabled?: boolean
}

type TriggerHandler = (evt: React.SyntheticEvent<HTMLElement>) => void

export interface TooltipTriggerProps {
	onMouseEnter?: TriggerHandler
	onMouseLeave?: TriggerHandler
	onPointerDown?: TriggerHandler
	onFocus?: TriggerHandler
	onBlur?: TriggerHandler
	'aria-describedby'?: string
}

const HOVER_DELAY = 400

function isFocusVisible(el: Element) {
	try {
		return el.matches(':focus-visible')
	} catch {
		return true
	}
}

/** Merge refs into one callback ref */
export function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
	return (el) => {
		for (const ref of refs) {
			if (typeof ref === 'function') ref(el)
			else if (ref) (ref as React.RefObject<T | null>).current = el
		}
	}
}

/** Chain the tooltip's trigger handlers after the element's own, join describedby ids */
export function composeTriggerProps(
	own: Record<string, unknown>,
	tip: TooltipTriggerProps
): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, val] of Object.entries(tip)) {
		const mine = own[key]
		if (key === 'aria-describedby') {
			out[key] = [mine, val].filter(Boolean).join(' ') || undefined
		} else if (typeof mine === 'function') {
			out[key] = (evt: React.SyntheticEvent<HTMLElement>) => {
				;(mine as TriggerHandler)(evt)
				;(val as TriggerHandler)(evt)
			}
		} else {
			out[key] = val
		}
	}
	return out
}

/**
 * Tooltip behaviour for a trigger that renders itself (Button uses this directly).
 * Spread `triggerProps` (via `composeTriggerProps`) and `ref` on the trigger, render `tooltip`.
 * Opens on hover (after a short delay) and keyboard focus; Escape, blur and press close it.
 */
export function useTooltip({
	content,
	placement = 'top',
	describe = true,
	disabled
}: UseTooltipOptions) {
	const id = React.useId()
	const [trigger, setTrigger] = React.useState<HTMLElement | null>(null)
	const [open, setOpen] = React.useState(false)
	const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
	const active = !disabled && content != null && content !== false && content !== ''

	const close = React.useCallback(() => {
		clearTimeout(timer.current)
		setOpen(false)
	}, [])
	React.useEffect(() => () => clearTimeout(timer.current), [])
	useEscapeKey(close, open)

	const triggerProps: TooltipTriggerProps = active
		? {
				onMouseEnter: () => {
					clearTimeout(timer.current)
					timer.current = setTimeout(() => setOpen(true), HOVER_DELAY)
				},
				onMouseLeave: close,
				onPointerDown: close,
				onFocus: (evt) => {
					if (isFocusVisible(evt.currentTarget)) setOpen(true)
				},
				onBlur: close,
				'aria-describedby': describe ? id : undefined
			}
		: {}

	// A described tooltip stays mounted (hidden) so `aria-describedby` always resolves
	const tooltip =
		active && (open || describe) ? (
			<TooltipPopup id={id} reference={trigger} placement={placement} open={open}>
				{content}
			</TooltipPopup>
		) : null

	return { ref: setTrigger, triggerProps, tooltip }
}

interface TooltipPopupProps {
	id: string
	reference: HTMLElement | null
	placement: TooltipPlacement
	open: boolean
	children: React.ReactNode
}

function TooltipPopup({ id, reference, placement, open, children }: TooltipPopupProps) {
	const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
	const { styles, attributes } = usePopper(open ? reference : null, popperEl, {
		placement,
		strategy: 'fixed',
		modifiers: [{ name: 'offset', options: { offset: [0, 6] } }]
	})

	return createPortal(
		<div
			ref={setPopperEl}
			id={id}
			role="tooltip"
			className="c-tooltip-popup"
			hidden={!open}
			style={styles.popper}
			{...attributes.popper}
		>
			{children}
		</div>,
		// Same target as Popper: `body` when the page has no #popper-container
		document.getElementById('popper-container') ?? document.body
	)
}

export interface TooltipProps extends UseTooltipOptions {
	/**
	 * One element that accepts a ref and the mouse/focus handlers. A natively
	 * `disabled` button fires neither — use Button `disabledReason` instead.
	 */
	children: React.ReactElement
}

/** `<Tooltip content>{trigger}</Tooltip>` — hover and focus, Escape closes */
export function Tooltip({ children, ...options }: TooltipProps) {
	const { ref, triggerProps, tooltip } = useTooltip(options)
	const child = children as React.ReactElement<Record<string, unknown>>
	const childRef = child.props.ref as React.Ref<HTMLElement> | undefined

	return (
		<>
			{React.cloneElement(child, {
				...composeTriggerProps(child.props, triggerProps),
				ref: mergeRefs(childRef, ref)
			})}
			{tooltip}
		</>
	)
}

// vim: ts=4
