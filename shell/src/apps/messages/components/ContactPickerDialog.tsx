// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Dialog, ProfileSelect, useApi, useAuth } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

// Single-select contact picker for starting a new direct message. Searches the
// same connected-people list as CreateGroupDialog, but picking a contact fires
// `onPick(idTag)` — no multi-select, no group semantics.
export function ContactPickerDialog({
	open,
	onClose,
	onPick
}: {
	open: boolean
	onClose: () => void
	onPick: (idTag: string) => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()

	// Server-side typeahead source for ProfileSelect (connected people, self
	// excluded). The Select component debounces the query internally.
	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		const profiles = await api.profiles.list({ q, connected: true, type: 'person' })
		return profiles?.filter((p) => p.idTag !== auth?.idTag)
	}

	return (
		<Dialog open={open} onClose={onClose} size="sm" title={t('New message')}>
			<ProfileSelect
				placeholder={t('Search contacts...')}
				listProfiles={listProfiles}
				onChange={(p) => p && onPick(p.idTag)}
			/>
		</Dialog>
	)
}

// vim: ts=4
