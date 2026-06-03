// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuUser as IcUser } from 'react-icons/lu'

import {
	generateRandomGuestName,
	getStoredGuestName,
	storeGuestName
} from '../utils/random-name.js'

export interface GuestNameDialogProps {
	open: boolean
	onConfirm: (name: string) => void
	/** Optional cancel path — when provided, Escape and a Cancel button return. */
	onCancel?: () => void
}

/**
 * Dialog for anonymous guests to enter their display name.
 * Shows a random 3-part name (Adjective + Color + Animal) as placeholder.
 * Pre-fills with stored name if available.
 */
export function GuestNameDialog({ open, onConfirm, onCancel }: GuestNameDialogProps) {
	const { t } = useTranslation()
	const storedName = getStoredGuestName()
	const [randomName] = React.useState(() => generateRandomGuestName())
	const [inputValue, setInputValue] = React.useState(storedName || '')
	const inputRef = React.useRef<HTMLInputElement>(null)
	const dialogRef = React.useRef<HTMLDivElement>(null)

	// Focus input when dialog opens
	React.useEffect(() => {
		if (open && inputRef.current) {
			inputRef.current.focus()
		}
	}, [open])

	const handleConfirm = () => {
		// Use entered name, or random placeholder if empty
		const finalName = inputValue.trim() || randomName
		// Only store if user actually entered a name (not using generated placeholder)
		if (inputValue.trim()) {
			storeGuestName(finalName)
		}
		onConfirm(finalName)
	}

	// Dialog-level key handling: Enter confirms; Tab is trapped within the
	// dialog so keyboard focus can't escape to the (inert) shell behind it.
	// Escape cancels via onCancel when a cancel path is provided (e.g. the lazy
	// collaborative-doc prompt in the folder browser); otherwise it's inert —
	// the top-level join flow passes no onCancel, since joining requires a name
	// and the suggested placeholder covers the "I don't care" case.
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleConfirm()
			return
		}
		if (e.key === 'Escape') {
			e.preventDefault()
			if (onCancel) onCancel()
			return
		}
		if (e.key === 'Tab') {
			const root = dialogRef.current
			if (!root) return
			const focusable = Array.from(
				root.querySelectorAll<HTMLElement>(
					'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => el.offsetParent !== null)
			if (focusable.length === 0) return
			const first = focusable[0]
			const last = focusable[focusable.length - 1]
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault()
				last.focus()
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault()
				first.focus()
			}
		}
	}

	if (!open) return null

	return (
		<div className="c-modal show" tabIndex={-1}>
			<div
				ref={dialogRef}
				className="c-dialog c-panel emph p-0"
				style={{ minWidth: '320px', maxWidth: '400px' }}
				role="dialog"
				aria-modal="true"
				aria-labelledby="guest-name-title"
				aria-describedby="guest-name-desc guest-name-hint"
				onKeyDown={handleKeyDown}
			>
				{/* Header */}
				<div className="c-hbox g-2 p-3 border-bottom">
					<IcUser style={{ fontSize: '1.25rem' }} />
					<h3 id="guest-name-title" className="m-0">
						{t('Join as Guest')}
					</h3>
				</div>

				{/* Content */}
				<div className="p-3">
					<p id="guest-name-desc" className="text-secondary mb-3">
						{t('Enter a name that other collaborators will see')}
					</p>
					<input
						ref={inputRef}
						type="text"
						className="c-input w-100"
						placeholder={randomName}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						autoFocus
					/>
					<p
						id="guest-name-hint"
						className="text-secondary mt-2"
						style={{ fontSize: '0.8rem' }}
					>
						{t('Leave blank to use the suggested name')}
					</p>
				</div>

				{/* Footer */}
				<div className="c-hbox g-2 p-3 border-top justify-content-end">
					{onCancel && <Button onClick={onCancel}>{t('Cancel')}</Button>}
					<Button variant="primary" onClick={handleConfirm}>
						{t('Join')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
