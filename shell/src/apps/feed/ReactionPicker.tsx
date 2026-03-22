// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import { Button } from '@cloudillo/react'

import { reactionTypes, getReactionEmoji } from './reactions.js'

export interface ReactionPickerProps {
	ownReaction?: string
	onReact: (key: string) => void
}

export function ReactionPicker({ ownReaction, onReact }: ReactionPickerProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [refEl, setRefEl] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
	const openTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const closeTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const longPressTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const longPressTriggered = React.useRef(false)

	React.useEffect(() => {
		return () => {
			if (openTimeout.current) clearTimeout(openTimeout.current)
			if (closeTimeout.current) clearTimeout(closeTimeout.current)
			if (longPressTimeout.current) clearTimeout(longPressTimeout.current)
		}
	}, [])

	const { styles: popperStyles, attributes } = usePopper(refEl, popperEl, {
		placement: 'top-start',
		strategy: 'fixed'
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

	function cancelClose() {
		if (closeTimeout.current) {
			clearTimeout(closeTimeout.current)
			closeTimeout.current = undefined
		}
	}

	function scheduleClose() {
		cancelClose()
		closeTimeout.current = setTimeout(() => setIsOpen(false), 150)
	}

	function handlePointerEnter(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		cancelClose()
		openTimeout.current = setTimeout(() => setIsOpen(true), 300)
	}

	function handlePointerLeave(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		if (openTimeout.current) {
			clearTimeout(openTimeout.current)
			openTimeout.current = undefined
		}
		if (isOpen) scheduleClose()
	}

	function handlePopperPointerEnter(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		cancelClose()
	}

	function handlePopperPointerLeave(e: React.PointerEvent) {
		if (e.pointerType === 'touch') return
		scheduleClose()
	}

	function handleTouchStart() {
		longPressTriggered.current = false
		longPressTimeout.current = setTimeout(() => {
			longPressTriggered.current = true
			setIsOpen(true)
		}, 500)
	}

	function handleTouchEnd() {
		if (longPressTimeout.current) {
			clearTimeout(longPressTimeout.current)
			longPressTimeout.current = undefined
		}
	}

	function handleClick() {
		if (longPressTriggered.current) {
			longPressTriggered.current = false
			return
		}
		onReact('LIKE')
	}

	function handleSelect(key: string) {
		setIsOpen(false)
		onReact(key)
	}

	return (
		<div ref={setRefEl} onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
			<Button
				link
				accent
				onClick={handleClick}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<span style={{ fontSize: '1.1em', lineHeight: 1 }}>
					{ownReaction ? getReactionEmoji(ownReaction) : '👍'}
				</span>
			</Button>
			{isOpen &&
				createPortal(
					<div
						ref={setPopperEl}
						className="c-popper high"
						style={{ ...popperStyles.popper, zIndex: 1000 }}
						onPointerEnter={handlePopperPointerEnter}
						onPointerLeave={handlePopperPointerLeave}
						{...attributes.popper}
					>
						<div className="c-hbox g-1 p-1">
							{reactionTypes.map((r) => (
								<button
									key={r.key}
									type="button"
									title={r.label}
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
						</div>
					</div>,
					document.getElementById('popper-container') ?? document.body
				)}
		</div>
	)
}

// vim: ts=4
