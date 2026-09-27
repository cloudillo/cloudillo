// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AddressBookOutput, ContactInput } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	Field,
	List,
	ListItem,
	LoadingSpinner,
	NativeSelect,
	ProfileCard,
	SearchInput,
	Text,
	VBox
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextAwareApi } from '../../../context/index.js'

export interface AddFromNetworkModalProps {
	open: boolean
	onClose: () => void
	addressBooks: AddressBookOutput[]
	defaultAddressBookId?: number
	onAdd: (abId: number, data: ContactInput) => Promise<void>
}

export function AddFromNetworkModal({
	open,
	onClose,
	addressBooks,
	defaultAddressBookId,
	onAdd
}: AddFromNetworkModalProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [query, setQuery] = React.useState('')
	const [results, setResults] = React.useState<Profile[]>([])
	const [searching, setSearching] = React.useState(false)
	const [abId, setAbId] = React.useState<number | undefined>(defaultAddressBookId)
	const [submitting, setSubmitting] = React.useState<string | undefined>()
	const [error, setError] = React.useState<string | undefined>()

	// Reset only on open→true transition; read fresh props via ref so later
	// prop changes don't clear the search query mid-typing.
	const openResetRef = React.useRef({ defaultAddressBookId, addressBooks })
	openResetRef.current = { defaultAddressBookId, addressBooks }
	React.useEffect(() => {
		if (!open) return
		const { defaultAddressBookId: defId, addressBooks: books } = openResetRef.current
		setAbId(defId ?? books[0]?.abId)
		setQuery('')
		setResults([])
		setError(undefined)
	}, [open])

	React.useEffect(
		function searchProfiles() {
			if (!api || !open || !query.trim()) {
				setResults([])
				return
			}
			let cancelled = false
			setSearching(true)
			const handle = setTimeout(async () => {
				try {
					const profiles = await api.profiles.list({ q: query.trim() })
					if (!cancelled) setResults(profiles)
				} catch (err) {
					if (!cancelled)
						setError(err instanceof Error ? err.message : t('Search failed'))
				} finally {
					if (!cancelled) setSearching(false)
				}
			}, 250)
			return () => {
				cancelled = true
				clearTimeout(handle)
			}
		},
		[api, open, query, t]
	)

	async function add(profile: Profile) {
		if (!abId) {
			setError(t('Select an address book'))
			return
		}
		setSubmitting(profile.idTag)
		setError(undefined)
		try {
			await onAdd(abId, {
				fn: profile.name || profile.idTag,
				profileIdTag: profile.idTag
			})
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to add contact'))
		} finally {
			setSubmitting(undefined)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={t('Add from Cloudillo network')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Close')}</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && (
					<Alert color="error" compact>
						{error}
					</Alert>
				)}

				<Field label={t('Address book')}>
					<NativeSelect
						value={abId ?? ''}
						onChange={(e) => setAbId(Number(e.target.value))}
					>
						{addressBooks.map((book) => (
							<option key={book.abId} value={book.abId}>
								{book.name}
							</option>
						))}
					</NativeSelect>
				</Field>

				<Field label={t('Search profiles')}>
					<SearchInput
						placeholder={t('Name or idTag')}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoFocus
					/>
				</Field>

				{searching ? (
					<LoadingSpinner size="sm" label={t('Searching...')} />
				) : (
					query.trim() &&
					results.length === 0 && (
						<Text as="p" emphasis="muted">
							{t('No matching profiles')}
						</Text>
					)
				)}
				<List>
					{results.map((profile) => (
						<ListItem
							key={profile.idTag}
							title={<ProfileCard profile={profile} />}
							trailing={
								<Button
									size="sm"
									color="primary"
									loading={submitting === profile.idTag}
									disabled={submitting !== undefined}
									onClick={() => add(profile)}
								>
									{t('Add')}
								</Button>
							}
						/>
					))}
				</List>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
