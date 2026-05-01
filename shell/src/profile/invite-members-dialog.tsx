// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuX as IcClose, LuCheck as IcCheck } from 'react-icons/lu'

import { Modal, Button, ProfileCard, useApi, useToast, mergeClasses } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'

interface InviteMembersDialogProps {
	open: boolean
	onClose: () => void
	communityIdTag: string
	onSent: () => void
}

export function InviteMembersDialog({
	open,
	onClose,
	communityIdTag,
	onSent
}: InviteMembersDialogProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const toast = useToast()

	const [contacts, setContacts] = React.useState<Profile[]>([])
	const [loading, setLoading] = React.useState(false)
	const [search, setSearch] = React.useState('')
	const [selected, setSelected] = React.useState<Profile[]>([])
	const [message, setMessage] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const cancelledRef = React.useRef(false)

	React.useEffect(
		function loadContacts() {
			if (!open || !api) return
			let cancelled = false
			setLoading(true)
			;(async function () {
				try {
					const list = (await api.profiles.list({ type: 'person' })) as Profile[]
					if (!cancelled) setContacts(list)
				} catch (err) {
					console.error('Failed to load contacts', err)
					if (!cancelled) setContacts([])
				} finally {
					if (!cancelled) setLoading(false)
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[open, api]
	)

	// Reset state when dialog closes
	React.useEffect(() => {
		if (!open) {
			cancelledRef.current = true
			setSearch('')
			setSelected([])
			setMessage('')
			setSubmitting(false)
		} else {
			cancelledRef.current = false
		}
	}, [open])

	const filtered = React.useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return contacts
		return contacts.filter(
			(p) => p.idTag.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q)
		)
	}, [contacts, search])

	function toggle(profile: Profile) {
		setSelected((prev) =>
			prev.some((p) => p.idTag === profile.idTag)
				? prev.filter((p) => p.idTag !== profile.idTag)
				: [...prev, profile]
		)
	}

	async function handleSubmit() {
		if (!api || selected.length === 0) return
		setSubmitting(true)
		const successfulTags = new Set<string>()
		for (const invitee of selected) {
			if (cancelledRef.current) break
			try {
				await api.actions.create({
					type: 'INVT',
					audienceTag: invitee.idTag,
					subject: '@' + communityIdTag,
					...(message.trim() ? { content: message.trim() } : {})
				})
				successfulTags.add(invitee.idTag)
			} catch (err) {
				console.error('Failed to send invitation to', invitee.idTag, err)
			}
		}
		if (cancelledRef.current) return
		setSubmitting(false)
		const successCount = successfulTags.size
		const failedCount = selected.length - successCount
		if (successCount > 0) {
			onSent()
		}
		if (failedCount === 0) {
			toast.success(t('{{count}} invitations sent', { count: successCount }))
			onClose()
		} else if (successCount > 0) {
			setSelected((prev) => prev.filter((p) => !successfulTags.has(p.idTag)))
			toast.error(
				t('{{sent}} invitations sent, {{failed}} failed', {
					sent: successCount,
					failed: failedCount
				})
			)
		} else {
			toast.error(t('Failed to send invitation'))
		}
	}

	return (
		<Modal open={open} onClose={onClose} className="p-0">
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '480px', width: '90vw' }}>
				<div className="c-hbox ai-center mb-3">
					<h2 className="flex-fill m-0">{t('Invite members')}</h2>
					<Button kind="link" onClick={onClose}>
						<IcClose />
					</Button>
				</div>

				<div className="c-vbox g-3">
					<div className="c-vbox g-1">
						<input
							type="search"
							className="c-input"
							placeholder={t('Search your connections')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					<div
						className="c-panel secondary p-2 overflow-y-auto"
						style={{ maxHeight: '280px' }}
					>
						{loading ? (
							<span className="text-muted p-2">{t('Loading...')}</span>
						) : filtered.length === 0 ? (
							<span className="text-muted p-2">{t('No contacts available')}</span>
						) : (
							filtered.map((profile) => {
								const isSelected = selected.some((p) => p.idTag === profile.idTag)
								return (
									<div
										key={profile.idTag}
										className={mergeClasses(
											'c-hbox ai-center g-2 p-2 rounded',
											isSelected && 'bg bg-container-primary'
										)}
										onClick={() => toggle(profile)}
										role="checkbox"
										aria-checked={isSelected}
										tabIndex={0}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault()
												toggle(profile)
											}
										}}
										style={{ cursor: 'pointer' }}
									>
										<div
											className={mergeClasses(
												'c-checkbox',
												isSelected && 'checked'
											)}
										>
											{isSelected && <IcCheck size={14} />}
										</div>
										<ProfileCard profile={profile} />
									</div>
								)
							})
						)}
					</div>

					<div className="c-vbox g-1">
						<label className="fw-medium">{t('Optional message')}</label>
						<textarea
							className="c-input"
							rows={3}
							value={message}
							onChange={(e) => setMessage(e.target.value)}
						/>
					</div>
				</div>

				<div className="c-hbox jc-end g-2 mt-4">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						variant="primary"
						disabled={selected.length === 0 || submitting}
						onClick={handleSubmit}
					>
						{t('Send invite')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
