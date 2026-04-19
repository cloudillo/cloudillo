// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

import { Button, Modal, ProfileCard } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import type { AddressBookOutput, ContactInput } from '@cloudillo/core'

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
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '520px', width: '100%' }}>
				<div className="d-flex align-items-center justify-content-between mb-3">
					<h3 className="m-0">{t('Add from Cloudillo network')}</h3>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{error && (
					<div
						className="c-panel bg-container-error p-2 mb-3"
						role="alert"
						aria-live="polite"
					>
						<span className="text-error">{error}</span>
					</div>
				)}

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Address book')}</label>
					<select
						className="c-input"
						value={abId ?? ''}
						onChange={(e) => setAbId(Number(e.target.value))}
					>
						{addressBooks.map((book) => (
							<option key={book.abId} value={book.abId}>
								{book.name}
							</option>
						))}
					</select>
				</div>

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Search profiles')}</label>
					<input
						className="c-input"
						type="search"
						placeholder={t('Name or idTag')}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoFocus
					/>
				</div>

				<div className="c-vbox g-1" style={{ maxHeight: 320, overflowY: 'auto' }}>
					{searching && <div className="c-hint p-2">{t('Searching...')}</div>}
					{!searching && query.trim() && results.length === 0 && (
						<div className="c-hint p-2">{t('No matching profiles')}</div>
					)}
					{results.map((profile) => (
						<button
							key={profile.idTag}
							type="button"
							className="c-link d-flex align-items-center g-2 p-2 w-100 text-left"
							disabled={submitting !== undefined}
							onClick={() => add(profile)}
						>
							<ProfileCard className="flex-fill" profile={profile} />
							<span className="c-tag small primary">
								{submitting === profile.idTag ? t('Adding...') : t('Add')}
							</span>
						</button>
					))}
				</div>

				<div className="d-flex justify-content-end g-2 mt-3">
					<Button onClick={onClose}>{t('Close')}</Button>
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
