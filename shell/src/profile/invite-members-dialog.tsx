// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Modal, ProfileCard, ProfileSelect, useApi, useToast } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

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

	function addToSelected(profile: Profile | undefined) {
		if (!profile) return
		setSelected((prev) =>
			prev.some((p) => p.idTag === profile.idTag) ? prev : [...prev, profile]
		)
	}

	function removeFromSelected(idTag: string) {
		setSelected((prev) => prev.filter((p) => p.idTag !== idTag))
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
		<Modal open={open} onClose={onClose} className="p-0">
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '480px', width: '90vw' }}>
				<div className="c-hbox ai-center mb-3">
					<h2 className="flex-fill m-0">{t('Invite members')}</h2>
					<Button kind="link" onClick={onClose}>
						<IcClose />
					</Button>
				</div>

				<div className="c-vbox g-3">
					<ProfileSelect listProfiles={listProfiles} onChange={addToSelected} />

					{selected.length === 0 ? (
						<span className="text-muted">{t('Search for connections to invite')}</span>
					) : (
						<div className="c-hbox flex-wrap g-1 ai-center">
							{selected.map((profile) => (
								<div key={profile.idTag} className="c-hbox ai-center g-1">
									<ProfileCard profile={profile} />
									<Button
										kind="link"
										onClick={() => removeFromSelected(profile.idTag)}
									>
										<IcClose />
									</Button>
								</div>
							))}
						</div>
					)}

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
