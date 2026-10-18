// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus } from '@cloudillo/core'
import * as React from 'react'
import { createPortal } from 'react-dom'

import { useLibTranslation } from '../../i18n.js'
import { profileNode, useProfile } from '../../profile-cache.js'
import { ActionSheet, ActionSheetItem } from '../ActionSheet/index.js'
import { Button } from '../Button/index.js'
import { useCanHover, useEscapeKey } from '../hooks.js'
import { overlayContainer, useAnchoredPosition } from '../Popover/Popover.js'
import { composeTriggerProps, mergeRefs, type TooltipTriggerProps } from '../Tooltip/Tooltip.js'
import { PersonActionsContext } from './PersonActionsContext.js'
import { PersonCard } from './PersonCard.js'

const HOVER_DELAY = 400
/** Time to cross the gap between trigger and card before the card closes */
const LEAVE_GRACE = 150

function isFocusVisible(el: Element) {
	try {
		return el.matches(':focus-visible')
	} catch {
		return true
	}
}

function stopPropagation(evt: React.SyntheticEvent) {
	evt.stopPropagation()
}

type TriggerHandler = (evt: React.SyntheticEvent<HTMLElement>) => void

export interface PersonHoverProps {
	idTag: string
	/** Context lines on the card, e.g. a community role or a file permission. */
	extra?: React.ReactNode
	/**
	 * On touch devices a tap opens the card as a sheet instead of activating the child
	 * (default true). Pass `false` where the tap already does something else.
	 */
	tapOpens?: boolean
	disabled?: boolean
	/** One element that accepts a ref and mouse/focus/click handlers. */
	children: React.ReactElement
}

/**
 * A person card on an avatar. Hover-capable devices: opens after a short hover or on
 * keyboard focus, the child's click is untouched. Touch: a tap opens it as a sheet.
 * Actions and the profile node come from `PersonActionsContext`.
 */
export function PersonHover({
	idTag,
	extra,
	tapOpens = true,
	disabled,
	children
}: PersonHoverProps) {
	const { t } = useLibTranslation()
	// Destructured once: the app default's handlers are getters
	const { node, openProfile, message, more } = React.useContext(PersonActionsContext)
	const canHover = useCanHover()
	const [trigger, setTrigger] = React.useState<HTMLElement | null>(null)
	const [surface, setSurface] = React.useState<HTMLElement | null>(null)
	const [mode, setMode] = React.useState<'closed' | 'card' | 'sheet'>('closed')
	// Fetch on first interest, not for every avatar on the page
	const [wanted, setWanted] = React.useState(false)
	const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
	const profile = useProfile(wanted ? idTag : undefined, node)
	const { style, attributes } = useAnchoredPosition(mode === 'card' ? trigger : null, surface, {
		placement: 'bottom-start',
		offset: 6
	})

	const close = React.useCallback(() => {
		clearTimeout(timer.current)
		setMode('closed')
	}, [])
	React.useEffect(() => () => clearTimeout(timer.current), [])
	// The sheet handles its own Escape
	useEscapeKey(close, mode === 'card')

	if (disabled) return children

	function after(ms: number, fn: () => void) {
		clearTimeout(timer.current)
		timer.current = setTimeout(fn, ms)
	}
	function hold() {
		clearTimeout(timer.current)
	}
	function leave() {
		after(LEAVE_GRACE, close)
	}
	function blurOut(evt: React.FocusEvent<HTMLElement>) {
		const to = evt.relatedTarget as Node | null
		if (!to || !(trigger?.contains(to) || surface?.contains(to))) close()
	}

	const triggerProps: TooltipTriggerProps & { onClickCapture?: TriggerHandler } = canHover
		? {
				onMouseEnter: () => {
					setWanted(true)
					if (mode === 'card') hold()
					else after(HOVER_DELAY, () => setMode('card'))
				},
				onMouseLeave: leave,
				onPointerDown: close,
				onFocus: (evt) => {
					if (!isFocusVisible(evt.currentTarget)) return
					setWanted(true)
					hold()
					setMode('card')
				},
				onBlur: (evt) => blurOut(evt as React.FocusEvent<HTMLElement>)
			}
		: tapOpens
			? {
					onClickCapture: (evt) => {
						// Before the child's own click (a Link would navigate)
						evt.preventDefault()
						evt.stopPropagation()
						setWanted(true)
						setMode('sheet')
					}
				}
			: {}

	const person = profile ?? { idTag }
	const srcTag = (node ?? profileNode(getAppBus())).tag
	const run = (fn: (idTag: string) => void) => () => {
		close()
		fn(idTag)
	}
	// The trigger stays in the DOM after the card closes, so `more` anchors to it
	const runMore = (evt: React.MouseEvent<HTMLElement>) => {
		const anchor = trigger ?? evt.currentTarget
		close()
		more?.(idTag, anchor)
	}

	const child = children as React.ReactElement<Record<string, unknown>>
	const childRef = child.props.ref as React.Ref<HTMLElement> | undefined

	return (
		<>
			{React.cloneElement(child, {
				...composeTriggerProps(child.props, triggerProps),
				ref: mergeRefs(childRef, setTrigger)
			})}
			{mode === 'card' &&
				createPortal(
					<div
						ref={setSurface}
						className="c-popper"
						style={style}
						{...attributes}
						onMouseEnter={hold}
						onMouseLeave={leave}
						onBlur={blurOut}
						// Portaled, but React still bubbles to our ancestors (a roster row, say)
						onClick={stopPropagation}
					>
						<PersonCard
							profile={person}
							extra={extra}
							srcTag={srcTag}
							actions={
								(openProfile || message || more) && (
									<>
										{openProfile && (
											<Button size="sm" immediate onClick={run(openProfile)}>
												{t('Open profile')}
											</Button>
										)}
										{message && (
											<Button size="sm" immediate onClick={run(message)}>
												{t('Message')}
											</Button>
										)}
										{more && (
											<Button
												size="sm"
												variant="ghost"
												immediate
												aria-label={t('More')}
												onClick={runMore}
											>
												⋯
											</Button>
										)}
									</>
								)
							}
						/>
					</div>,
					overlayContainer(trigger)
				)}
			{!canHover && tapOpens && (
				<ActionSheet
					isOpen={mode === 'sheet'}
					onClose={close}
					aria-label={person.name ?? idTag}
					onClick={stopPropagation}
				>
					<PersonCard profile={person} extra={extra} srcTag={srcTag} />
					{openProfile && (
						<ActionSheetItem label={t('Open profile')} onClick={run(openProfile)} />
					)}
					{message && <ActionSheetItem label={t('Message')} onClick={run(message)} />}
					{more && <ActionSheetItem label={t('More')} onClick={runMore} />}
				</ActionSheet>
			)}
		</>
	)
}

// vim: ts=4
