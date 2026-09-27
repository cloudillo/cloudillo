// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ActionBar, Button, Dialog, Field, Input } from '@cloudillo/react'
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
 *
 * Without `onCancel` the dialog is blocking: joining requires a name, and the
 * suggested placeholder covers the "I don't care" case.
 */
export function GuestNameDialog({ open, onConfirm, onCancel }: GuestNameDialogProps) {
	const { t } = useTranslation()
	const [randomName] = React.useState(() => generateRandomGuestName())
	const [inputValue, setInputValue] = React.useState(() => getStoredGuestName() || '')

	const handleConfirm = () => {
		// Use entered name, or random placeholder if empty
		const finalName = inputValue.trim() || randomName
		// Only store if user actually entered a name (not using generated placeholder)
		if (inputValue.trim()) {
			storeGuestName(finalName)
		}
		onConfirm(finalName)
	}

	if (!open) return null

	return (
		<Dialog
			open
			size="sm"
			icon={<IcUser />}
			title={t('Join as Guest')}
			description={t('Enter a name that other collaborators will see')}
			dismissable={!!onCancel}
			onClose={onCancel}
			onSubmit={handleConfirm}
			footer={
				<ActionBar>
					{onCancel && <Button onClick={onCancel}>{t('Cancel')}</Button>}
					<Button type="submit" color="primary">
						{t('Join')}
					</Button>
				</ActionBar>
			}
		>
			<Field label={t('Name')} hint={t('Leave blank to use the suggested name')}>
				<Input
					placeholder={randomName}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					autoFocus
				/>
			</Field>
		</Dialog>
	)
}

// vim: ts=4
