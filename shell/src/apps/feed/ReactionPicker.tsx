// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, Popover } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcRemove, LuThumbsUp as IcThumbsUp } from 'react-icons/lu'

import {
	getReactionEmoji,
	getReactionLabel,
	getReactionPastLabel,
	reactionTypes
} from './reactions.js'

export interface ReactionPickerProps {
	className?: string
	ownReaction?: string
	onReact: (key: string) => void
}

type HoverRegion = 'trigger' | 'surface'

const OPEN_DELAY_MS = 250
const CLOSE_DELAY_MS = 300

export function ReactionPicker({ className, ownReaction, onReact }: ReactionPickerProps) {
	const { t } = useTranslation()
	const [isOpen, setIsOpen] = React.useState(false)
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

	function handleSurfacePointerEnter(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		enterRegion('surface')
	}

	function handleSurfacePointerLeave(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		leaveRegion('surface')
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

	// The trigger's click reacts; the Popover only opens on hover or long press, so its
	// own open requests are ignored and only its closes (Escape, outside click) apply.
	return (
		<Popover
			placement="top-start"
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) setIsOpen(false)
			}}
			aria-label={t('React')}
			onPointerEnter={handleSurfacePointerEnter}
			onPointerLeave={handleSurfacePointerLeave}
			trigger={
				<Button
					className={className}
					variant={ownReaction ? 'filled' : 'link'}
					color={ownReaction ? 'primary' : 'accent'}
					size="sm"
					aria-label={ownReaction ? t('Change reaction') : t('Like')}
					icon={ownReaction ? getReactionEmoji(ownReaction) : <IcThumbsUp />}
					onClick={handleClick}
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
					onPointerEnter={handleTriggerPointerEnter}
					onPointerLeave={handleTriggerPointerLeave}
				>
					{ownReaction ? activeLabel : t('Like')}
				</Button>
			}
		>
			<HBox gap={1} align="center">
				{reactionTypes.map((r) => (
					<Button
						key={r.key}
						variant={ownReaction === r.key ? 'soft' : 'ghost'}
						color={ownReaction === r.key ? 'accent' : undefined}
						aria-label={getReactionLabel(t, r.key)}
						aria-pressed={ownReaction === r.key}
						icon={r.emoji}
						onClick={() => handleSelect(r.key)}
					/>
				))}
				{ownReaction && (
					<Button
						variant="ghost"
						aria-label={t('Remove reaction')}
						icon={<IcRemove />}
						onClick={handleRemove}
					/>
				)}
			</HBox>
		</Popover>
	)
}

// vim: ts=4
