// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { delay } from '@cloudillo/core'
import * as React from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { composeTriggerProps, mergeRefs, useTooltip } from '../Tooltip/Tooltip.js'
import type { ColorVariant, Size } from '../types.js'
import { createComponent, isCrossOrigin, isInternal, mergeClasses } from '../utils.js'

/** Shape of the button. `link` renders the `c-link` text-link look. */
export type ButtonVariant = 'filled' | 'soft' | 'ghost' | 'link'

/** @deprecated Use `Nav.Item` / `MenuItem`. */
export type ButtonKind = 'nav-item' | 'nav-link'

interface ButtonBaseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** Tone. `neutral` (and unset) renders the default look. */
	color?: ColorVariant
	/** Shape. Defaults to `filled`. */
	variant?: ButtonVariant
	/** Defaults to `md`. */
	size?: Size
	/** `pill`: fully rounded; round when icon-only. */
	shape?: 'pill'
	/** @deprecated Use `Nav.Item` / `MenuItem`. */
	kind?: ButtonKind
	/**
	 * `/…` renders a router `Link`, anything else an `<a>` (`rel="noopener"` when
	 * cross-origin). Unset renders a `<button>`.
	 */
	href?: string
	/** With `href`: the link target. */
	target?: string
	/** Toggle state: `aria-pressed` plus the active look. */
	pressed?: boolean
	/** @deprecated Use `pressed`. Active look only, no `aria-pressed`. */
	active?: boolean
	/** Spinner in place of the content (width kept), `aria-busy`, clicks blocked. */
	loading?: boolean
	/**
	 * Disabled but still focusable (`aria-disabled`, clicks blocked); the reason
	 * shows as a tooltip and is announced as the description.
	 */
	disabledReason?: React.ReactNode
	/**
	 * Fire `onClick` synchronously on click instead of after the ~200ms press
	 * animation. Required when the handler must run inside the browser's user-
	 * activation window — e.g. opening a native file dialog or clipboard writes.
	 * The press animation still plays; only the callback timing changes.
	 */
	immediate?: boolean
}

/** Button with visible content (optionally with a leading icon). */
export interface LabeledButtonProps extends ButtonBaseProps {
	icon?: React.ReactNode
	children: React.ReactNode
}

/**
 * Icon-only button (inferred from `icon` without children): `aria-label` is required
 * and shown as a tooltip.
 */
export interface IconButtonProps extends ButtonBaseProps {
	icon: React.ReactNode
	children?: undefined
	'aria-label': string
}

export type ButtonProps = LabeledButtonProps | IconButtonProps

function baseClass(kind: ButtonKind | undefined, variant: ButtonVariant | undefined) {
	if (kind === 'nav-item') return 'c-nav-item'
	if (kind === 'nav-link') return 'c-nav-link'
	if (variant === 'link') return 'c-link'
	return 'c-button'
}

export const Button = createComponent<HTMLButtonElement, ButtonProps>(
	'Button',
	(
		{
			className,
			type = 'button',
			onClick,
			color,
			variant,
			size,
			shape,
			kind,
			href,
			target,
			pressed,
			active,
			loading,
			disabled,
			disabledReason,
			immediate,
			icon,
			children,
			...props
		},
		ref
	) => {
		const [clicked, setClicked] = React.useState(false)
		const iconOnly = !!icon && (children === undefined || children === null)
		const tip = useTooltip({
			content: disabledReason || (iconOnly ? props['aria-label'] : undefined),
			describe: !!disabledReason
		})
		const blocked = !!disabledReason || !!loading || (!!href && !!disabled)

		async function handleClick(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
			evt.preventDefault()
			if (blocked) return
			const form = (evt.currentTarget as HTMLButtonElement).form

			// Synchronous path: keep the call inside the user-activation window.
			if (immediate && type !== 'submit' && onClick) {
				onClick(evt)
			}

			// Animation
			setClicked(true)
			await delay(200)
			setClicked(false)

			if (type === 'submit') {
				form?.requestSubmit()
			} else if (onClick && !immediate) {
				// Original event is stale after await — synthesize a minimal event object.
				const syntheticEvent = {
					preventDefault: () => {},
					stopPropagation: () => {},
					target: form,
					currentTarget: form
				} as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>
				onClick(syntheticEvent)
			}
		}

		// Links navigate natively: no press delay, no preventDefault unless blocked.
		function handleLinkClick(evt: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
			if (blocked) {
				evt.preventDefault()
				return
			}
			onClick?.(evt as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>)
		}

		const common: Record<string, unknown> = {
			...props,
			...composeTriggerProps(props, tip.triggerProps),
			ref: mergeRefs(ref as React.Ref<HTMLElement>, tip.ref),
			className: mergeClasses(
				baseClass(kind, variant),
				color !== 'neutral' && color,
				(variant === 'soft' || variant === 'ghost') && variant,
				size !== 'md' && size,
				shape,
				iconOnly && 'icon',
				(pressed ?? active) && 'active',
				loading && 'loading',
				clicked && 'clicked',
				icon && !iconOnly ? 'g-2' : undefined,
				className
			),
			'aria-pressed': pressed,
			'aria-busy': loading || undefined,
			'aria-disabled': disabledReason || (href && disabled) ? true : props['aria-disabled']
		}

		const content = loading ? (
			<>
				<span className="c-button-content">
					{icon}
					{children}
				</span>
				<span className="c-button-spinner" aria-hidden="true" />
			</>
		) : (
			<>
				{icon}
				{children}
			</>
		)

		if (href) {
			const linkProps = { ...common, target, onClick: handleLinkClick }
			return (
				<>
					{isInternal(href) ? (
						<RouterLink to={href} {...linkProps}>
							{content}
						</RouterLink>
					) : (
						<a
							href={href}
							rel={isCrossOrigin(href) ? 'noopener' : undefined}
							{...linkProps}
						>
							{content}
						</a>
					)}
					{tip.tooltip}
				</>
			)
		}

		return (
			<>
				<button
					{...common}
					type={type}
					disabled={disabledReason ? undefined : disabled}
					onClick={handleClick}
				>
					{content}
				</button>
				{tip.tooltip}
			</>
		)
	}
)

// vim: ts=4
