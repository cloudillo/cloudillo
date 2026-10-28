// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	ActionBar,
	Button,
	Dialog,
	Field,
	ProfileMultiSelect,
	useApi,
	useAuth,
	useToast
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcInvite } from '../../../icons.js'
import type { Conversation, ConversationMember } from '../types.js'
import { listConnectedPeople, sendInvites } from '../utils.js'

export interface InviteDialogProps {
	open: boolean
	onClose: () => void
	conversation: Conversation
	members?: ConversationMember[]
	onInvited: () => void
}

// Moderator+ invite. Contacts are searched on the home node; the INVT goes to the
// owning community node for a community group, the home node otherwise.
export function InviteDialog({
	open,
	onClose,
	conversation,
	members,
	onInvited
}: InviteDialogProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const { api: homeApi } = useApi()
	const { api: inviteApi } = useApi(conversation.communityTag)
	const [auth] = useAuth()

	const [selected, setSelected] = React.useState<Profile[]>([])
	const [isInviting, setIsInviting] = React.useState(false)

	// Typeahead source: connected people, excluding self and current/invited members.
	const listProfiles = (q: string) =>
		listConnectedPeople(homeApi, q, [
			auth?.idTag,
			...(members ?? []).map((m) => m.profile.idTag)
		])

	async function invite() {
		if (!inviteApi || selected.length === 0) return
		setIsInviting(true)
		const failed = await sendInvites(inviteApi, conversation.id, conversation.name, selected)
		setIsInviting(false)
		if (failed.length) {
			console.error('Failed to invite members', failed)
			toast.error(
				t('Could not invite {{names}}', {
					names: failed.map((p) => p.name || p.idTag).join(', ')
				})
			)
			// Keep the failed ones selected so a retry is one click.
			setSelected(failed)
			if (failed.length < selected.length) onInvited()
			return
		}
		setSelected([])
		onInvited()
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="sm"
			title={t('Invite people')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						icon={<IcInvite />}
						disabled={selected.length === 0}
						loading={isInviting}
						onClick={invite}
					>
						{t('Send Invites')}
					</Button>
				</ActionBar>
			}
		>
			<Field label={t('Select members to invite')}>
				<ProfileMultiSelect
					placeholder={t('Search contacts...')}
					emptyText={t('Search for connections to invite')}
					listProfiles={listProfiles}
					value={selected}
					onAdd={(p) => setSelected((prev) => [...prev, p])}
					onRemove={(p) => setSelected((prev) => prev.filter((m) => m.idTag !== p.idTag))}
				/>
			</Field>
		</Dialog>
	)
}

// vim: ts=4
