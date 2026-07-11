// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	LoadingSpinner,
	Modal,
	ProfileMultiSelect,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose, LuUserPlus as IcInvite } from 'react-icons/lu'

import type { Conversation, ConversationMember } from '../types.js'

export function InviteMemberDialog({
	open,
	onClose,
	conversation,
	members,
	onInvited
}: {
	open: boolean
	onClose: () => void
	conversation: Conversation
	members?: ConversationMember[]
	onInvited: () => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()

	const [selectedInvites, setSelectedInvites] = React.useState<Profile[]>([])
	const [isInviting, setIsInviting] = React.useState(false)

	// Server-side typeahead source for ProfileSelect (connected people,
	// excluding self and existing/invited members). The Select component
	// debounces the query internally.
	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		const profiles = await api.profiles.list({ q, connected: true, type: 'person' })
		const memberIdTags = new Set((members || []).map((m) => m.profile.idTag))
		return profiles?.filter((p) => p.idTag !== auth?.idTag && !memberIdTags.has(p.idTag))
	}

	async function handleInviteMembers() {
		if (!api || !conversation || selectedInvites.length === 0) return

		setIsInviting(true)
		try {
			await Promise.all(
				selectedInvites.map((profile) =>
					api.actions.create({
						type: 'INVT',
						audienceTag: profile.idTag,
						subject: conversation.id,
						content: {
							role: 'member',
							groupName: conversation.name
						}
					})
				)
			)
			setSelectedInvites([])
			onInvited()
		} catch (err) {
			console.error('Failed to invite members', err)
		} finally {
			setIsInviting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose} className="p-0">
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '400px', width: '90vw' }}>
				<div className="c-hbox align-items-center mb-3">
					<h2 className="fill m-0">{t('Invite Members')}</h2>
					<Button kind="link" onClick={onClose}>
						<IcClose />
					</Button>
				</div>

				<div className="c-vbox g-3">
					<div className="c-vbox g-1">
						<label className="fw-medium">{t('Select members to invite')}</label>
						<ProfileMultiSelect
							placeholder={t('Search contacts...')}
							emptyText={t('Search for connections to invite')}
							listProfiles={listProfiles}
							value={selectedInvites}
							onAdd={(p) => setSelectedInvites((prev) => [...prev, p])}
							onRemove={(p) =>
								setSelectedInvites((prev) =>
									prev.filter((m) => m.idTag !== p.idTag)
								)
							}
						/>
					</div>
				</div>

				<div className="c-hbox justify-content-end g-2 mt-4">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						variant="primary"
						disabled={selectedInvites.length === 0 || isInviting}
						onClick={handleInviteMembers}
					>
						{isInviting ? (
							<LoadingSpinner size="sm" />
						) : (
							<>
								<IcInvite className="me-1" />
								{t('Send Invites')}
							</>
						)}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
