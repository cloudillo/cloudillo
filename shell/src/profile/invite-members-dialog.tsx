// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionBar,
	Button,
	Dialog,
	Field,
	ProfileMultiSelect,
	TextArea,
	useApi,
	useToast,
	VBox
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface InviteMembersDialogProps {
	open: boolean
	onClose: () => void
	communityIdTag: string
	communityName?: string
	onSent: () => void
}

export function InviteMembersDialog({
	open,
	onClose,
	communityIdTag,
	communityName,
	onSent
}: InviteMembersDialogProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const toast = useToast()

	const [selected, setSelected] = React.useState<Profile[]>([])
	const [message, setMessage] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const cancelledRef = React.useRef(false)

	// Reset state when dialog closes
	React.useEffect(() => {
		if (!open) {
			cancelledRef.current = true
			setSelected([])
			setMessage('')
			setSubmitting(false)
		} else {
			cancelledRef.current = false
		}
	}, [open])

	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		return api.profiles.list({ q, connected: true, type: 'person' })
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
					content: {
						role: 'member',
						groupName: communityName || communityIdTag,
						...(message.trim() ? { message: message.trim() } : {})
					}
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
		<Dialog
			open={open}
			onClose={onClose}
			size="sm"
			title={t('Invite members')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={selected.length === 0 || submitting}
						onClick={handleSubmit}
					>
						{t('Send invite')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				<ProfileMultiSelect
					emptyText={t('Search for connections to invite')}
					listProfiles={listProfiles}
					value={selected}
					onAdd={(p) => setSelected((prev) => [...prev, p])}
					onRemove={(p) => setSelected((prev) => prev.filter((m) => m.idTag !== p.idTag))}
				/>

				<Field label={t('Optional message')}>
					<TextArea
						rows={3}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
				</Field>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
