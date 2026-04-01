// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuUser as IcUser } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

import {
	generateRandomGuestName,
	getStoredGuestName,
	storeGuestName
} from '../utils/random-name.js'

export interface GuestNameDialogProps {
	open: boolean
	onConfirm: (name: string) => void
}

/**
 * Dialog for anonymous guests to enter their display name.
 * Shows a random 3-part name (Adjective + Color + Animal) as placeholder.
 * Pre-fills with stored name if available.
 */
export function GuestNameDialog({ open, onConfirm }: GuestNameDialogProps) {
	const { t } = useTranslation()
	const storedName = getStoredGuestName()
	const [randomName] = React.useState(() => generateRandomGuestName())
	const [inputValue, setInputValue] = React.useState(storedName || '')
	const inputRef = React.useRef<HTMLInputElement>(null)

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

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleConfirm()
		}
	}

	if (!open) return null

	return (
		<div className="c-modal show" tabIndex={-1}>
			<div
				className="c-dialog c-panel emph p-0"
				style={{ minWidth: '320px', maxWidth: '400px' }}
			>
				{/* Header */}
				<div className="c-hbox g-2 p-3 border-bottom">
					<IcUser style={{ fontSize: '1.25rem' }} />
					<h3 className="m-0">{t('Join as Guest')}</h3>
				</div>

				{/* Content */}
				<div className="p-3">
					<p className="text-secondary mb-3">
						{t('Enter a name that other collaborators will see')}
					</p>
					<input
						ref={inputRef}
						type="text"
						className="c-input w-100"
						placeholder={randomName}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						autoFocus
					/>
				</div>

				{/* Footer */}
				<div className="c-hbox g-2 p-3 border-top justify-content-end">
					<Button primary onClick={handleConfirm}>
						{t('Join')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
