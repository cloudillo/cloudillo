// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { useTranslation } from 'react-i18next'
import { LuThumbsUp as IcThumbsUp, LuX as IcRemove } from 'react-icons/lu'

import { Button, mergeClasses } from '@cloudillo/react'

import {
	reactionTypes,
	getReactionEmoji,
	getReactionLabel,
	getReactionPastLabel
} from './reactions.js'

export interface ReactionPickerProps {
	className?: string
	ownReaction?: string
	onReact: (key: string) => void
}

type HoverRegion = 'trigger' | 'popper'

const OPEN_DELAY_MS = 250
const CLOSE_DELAY_MS = 300

export function ReactionPicker({ className, ownReaction, onReact }: ReactionPickerProps) {
	const { t } = useTranslation()
	const [isOpen, setIsOpen] = React.useState(false)
	const [refEl, setRefEl] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
	const hoverRegions = React.useRef<Set<HoverRegion>>(new Set())
	const openTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const longPressTriggered = React.useRef(false)

	React.useEffect(() => {
		return () => {
			if (openTimer.current) clearTimeout(openTimer.current)
			if (closeTimer.current) clearTimeout(closeTimer.current)
			if (longPressTimer.current) clearTimeout(longPressTimer.current)
		}
	}, [])

	const { styles: popperStyles, attributes } = usePopper(refEl, popperEl, {
		placement: 'top-start',
		strategy: 'fixed',
		modifiers: [
			{ name: 'flip', options: { fallbackPlacements: ['bottom-start'] } },
			{ name: 'offset', options: { offset: [0, 4] } }
		]
	})

	React.useEffect(() => {
		if (!isOpen || !popperEl) return

		function handleClickOutside(evt: MouseEvent) {
			if (!(evt.target instanceof Node)) return
			if (popperEl?.contains(evt.target) || refEl?.contains(evt.target)) return
			setIsOpen(false)
		}

		document.addEventListener('click', handleClickOutside, true)
		return () => {
			document.removeEventListener('click', handleClickOutside, true)
		}
	}, [isOpen, popperEl, refEl])

	function cancelOpenTimer() {
		if (openTimer.current) {
			clearTimeout(openTimer.current)
			openTimer.current = undefined
		}
	}

	function cancelCloseTimer() {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current)
			closeTimer.current = undefined
		}
	}

	function enterRegion(region: HoverRegion) {
		hoverRegions.current.add(region)
		cancelCloseTimer()
		if (!isOpen && !openTimer.current) {
			openTimer.current = setTimeout(() => {
				openTimer.current = undefined
				setIsOpen(true)
			}, OPEN_DELAY_MS)
		}
	}

	function leaveRegion(region: HoverRegion) {
		hoverRegions.current.delete(region)
		if (hoverRegions.current.size === 0) {
			cancelOpenTimer()
			cancelCloseTimer()
			closeTimer.current = setTimeout(() => {
				closeTimer.current = undefined
				if (hoverRegions.current.size === 0) setIsOpen(false)
			}, CLOSE_DELAY_MS)
		}
	}

	function handleTriggerPointerEnter(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		enterRegion('trigger')
	}

	function handleTriggerPointerLeave(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		leaveRegion('trigger')
	}

	function handlePopperPointerEnter(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		enterRegion('popper')
	}

	function handlePopperPointerLeave(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		leaveRegion('popper')
	}

	function handleTouchStart() {
		longPressTriggered.current = false
		longPressTimer.current = setTimeout(() => {
			longPressTriggered.current = true
			setIsOpen(true)
		}, 500)
	}

	function handleTouchEnd() {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current)
			longPressTimer.current = undefined
		}
	}

	function handleClick() {
		if (longPressTriggered.current) {
			longPressTriggered.current = false
			return
		}
		onReact(ownReaction ?? 'LIKE')
	}

	function handleSelect(key: string) {
		hoverRegions.current.clear()
		cancelOpenTimer()
		cancelCloseTimer()
		setIsOpen(false)
		onReact(key)
	}

	function handleRemove() {
		if (!ownReaction) return
		handleSelect(ownReaction)
	}

	const activeLabel = ownReaction ? getReactionPastLabel(t, ownReaction) : null

	return (
		<div
			ref={setRefEl}
			className={mergeClasses(className, ownReaction && 'c-reaction-chip--active')}
			onPointerEnter={handleTriggerPointerEnter}
			onPointerLeave={handleTriggerPointerLeave}
		>
			<Button
				kind={ownReaction ? 'button' : 'link'}
				variant={ownReaction ? 'primary' : 'accent'}
				size="small"
				aria-label={ownReaction ? t('Change reaction') : t('Like')}
				onClick={handleClick}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				{ownReaction ? (
					<>
						<span style={{ fontSize: '1.1em', lineHeight: 1 }}>
							{getReactionEmoji(ownReaction)}
						</span>
						<small>{activeLabel}</small>
					</>
				) : (
					<>
						<IcThumbsUp />
						<small>{t('Like')}</small>
					</>
				)}
			</Button>
			{isOpen &&
				createPortal(
					<div
						ref={setPopperEl}
						className="c-popper high"
						style={{ ...popperStyles.popper, zIndex: 1000 }}
						onPointerEnter={handlePopperPointerEnter}
						onPointerLeave={handlePopperPointerLeave}
						aria-label={t('React')}
						{...attributes.popper}
					>
						<div className="c-hbox g-1 p-1 align-items-center">
							{reactionTypes.map((r) => (
								<button
									key={r.key}
									type="button"
									title={getReactionLabel(t, r.key)}
									aria-label={getReactionLabel(t, r.key)}
									onClick={() => handleSelect(r.key)}
									style={{
										fontSize: '1.4rem',
										cursor: 'pointer',
										background: 'none',
										border: 'none',
										padding: '0.25rem',
										borderRadius: '0.25rem',
										outline:
											ownReaction === r.key
												? '2px solid var(--col-accent)'
												: 'none',
										transition: 'transform 0.15s ease'
									}}
									onPointerEnter={(e) => {
										if (e.pointerType !== 'touch')
											(e.currentTarget as HTMLElement).style.transform =
												'scale(1.3)'
									}}
									onPointerLeave={(e) => {
										if (e.pointerType !== 'touch')
											(e.currentTarget as HTMLElement).style.transform =
												'scale(1)'
									}}
								>
									{r.emoji}
								</button>
							))}
							{ownReaction && (
								<button
									type="button"
									className="c-reaction-remove-btn"
									title={t('Remove reaction')}
									aria-label={t('Remove reaction')}
									onClick={handleRemove}
								>
									<IcRemove />
								</button>
							)}
						</div>
					</div>,
					document.getElementById('popper-container') ?? document.body
				)}
		</div>
	)
}

// vim: ts=4
