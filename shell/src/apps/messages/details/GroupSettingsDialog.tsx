// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	ActionBar,
	Button,
	Dialog,
	Field,
	HBox,
	Input,
	NativeSelect,
	ProfilePicture,
	RadioGroup,
	Text,
	TextArea,
	useApi,
	useAuth,
	useFilePicker,
	useToast,
	VBox
} from '@cloudillo/react'
import type { CommunityRole } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { roleLabels } from '../../../profile/role-labels.js'
import type { Conversation } from '../types.js'

export type JoinPolicy = Pick<Conversation, 'join' | 'joinMinRole'>

const JOIN_ROLES: CommunityRole[] = ['supporter', 'contributor', 'moderator', 'leader']

/** Community group join policy: role-gated / request / private. */
export function JoinPolicyField({
	value,
	onChange
}: {
	value: JoinPolicy
	onChange: (value: JoinPolicy) => void
}) {
	const { t } = useTranslation()
	const labels = roleLabels(t)
	const minRole = value.joinMinRole ?? 'supporter'
	return (
		<Field label={t('Who can join')}>
			<RadioGroup
				name="join"
				value={value.join ?? 'private'}
				onChange={(join) =>
					onChange({ join, joinMinRole: join === 'role' ? minRole : undefined })
				}
				options={[
					{
						value: 'role',
						label: t('Members with a role can join'),
						description: (
							<HBox gap={1} align="center" wrap>
								<Text as="span">{t('Members with role')}</Text>
								<NativeSelect
									size="sm"
									aria-label={t('Minimum role')}
									value={minRole}
									onChange={(e) =>
										onChange({
											join: 'role',
											joinMinRole: e.target.value as CommunityRole
										})
									}
								>
									{JOIN_ROLES.map((r) => (
										<option key={r} value={r}>
											{labels[r]}
										</option>
									))}
								</NativeSelect>
								<Text as="span">{t('and above can join')}</Text>
							</HBox>
						)
					},
					{
						value: 'request',
						label: t('By request'),
						description: t('Anyone in the community can ask to join')
					},
					{
						value: 'private',
						label: t('Private'),
						description: t('Private — invite only, hidden')
					}
				]}
			/>
		</Field>
	)
}

export interface GroupSettingsDialogProps {
	open: boolean
	onClose: () => void
	conversation: Conversation
	onSaved: () => void
}

// Admin-only group settings. The CONV:UPD is issued on the admin's home node and
// addressed to the CONV's host, which checks the role, applies it and relays it to the members
// (owner APRV). The host's own edit carries no audience and fans out directly.
export function GroupSettingsDialog({
	open,
	onClose,
	conversation,
	onSaved
}: GroupSettingsDialogProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const community = conversation.communityTag
	const { api } = useApi(community)
	const { api: homeApi } = useApi()
	const [auth] = useAuth()
	const [name, setName] = React.useState(conversation.name ?? '')
	const [description, setDescription] = React.useState(conversation.description ?? '')
	const [picture, setPicture] = React.useState(conversation.picture)
	const [isOpen, setIsOpen] = React.useState(!!conversation.isOpen)
	const [policy, setPolicy] = React.useState<JoinPolicy>({
		join: conversation.join,
		joinMinRole: conversation.joinMinRole
	})
	const [uploading, setUploading] = React.useState(false)
	const [saving, setSaving] = React.useState(false)
	const picker = useFilePicker({
		accept: 'image/*',
		multiple: false,
		disabled: uploading,
		onFiles: (files) => upload(files[0])
	})

	// Reset to the current values each time the dialog opens — not on every refresh
	// of `conversation`, which would wipe unsaved edits.
	const convRef = React.useRef(conversation)
	convRef.current = conversation
	React.useEffect(() => {
		if (!open) return
		const c = convRef.current
		setName(c.name ?? '')
		setDescription(c.description ?? '')
		setPicture(c.picture)
		setIsOpen(!!c.isOpen)
		setPolicy({ join: c.join, joinMinRole: c.joinMinRole })
	}, [open])

	// uploaded to the owner node's API (home for a personal group), so a non-owner
	// admin's picture is served from the wrong node; move to the owner node when that matters.
	async function upload(file: File | undefined) {
		if (!api || !file) return
		setUploading(true)
		try {
			const res = await api.files.uploadBlob('image', file.name, file, file.type, {
				as: 'managed'
			})
			if (res?.fileId) setPicture(res.fileId)
		} catch (err) {
			console.error('Failed to upload group picture', err)
			toast.error(t('Could not upload the picture'))
		} finally {
			setUploading(false)
		}
	}

	async function save() {
		if (!homeApi || !name.trim()) return
		const host = conversation.ownerTag
		setSaving(true)
		try {
			await homeApi.actions.create({
				type: 'CONV',
				subType: 'UPD',
				subject: conversation.id,
				...(host && host !== auth?.idTag ? { audienceTag: host } : {}),
				// Explicit 'o' (not ''): the host only touches the open letter when one is sent.
				...(community ? {} : { flags: isOpen ? 'O' : 'o' }),
				content: {
					name: name.trim(),
					description: description.trim() || undefined,
					picture,
					...(community ? policy : {})
				}
			})
			onSaved()
		} catch (err) {
			console.error('Failed to update group settings', err)
			toast.error(t('Could not save the group settings'))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="sm"
			title={t('Group settings')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={!name.trim() || uploading}
						loading={saving}
						onClick={save}
					>
						{t('Save')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				<Field label={t('Picture')}>
					<HBox gap={2} align="center">
						<ProfilePicture
							profile={{ name, profilePic: picture }}
							srcTag={conversation.ownerTag}
							size="lg"
						/>
						{picker.input}
						<Button variant="ghost" disabled={uploading} onClick={picker.open}>
							{t('Choose a picture')}
						</Button>
						{picture && (
							<Button variant="ghost" onClick={() => setPicture(undefined)}>
								{t('Remove')}
							</Button>
						)}
					</HBox>
				</Field>
				<Field label={t('Name')} required error={name.trim() ? undefined : t('Required')}>
					<Input value={name} onChange={(e) => setName(e.target.value)} />
				</Field>
				<Field label={t('Description')}>
					<TextArea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</Field>
				{community ? (
					<JoinPolicyField value={policy} onChange={setPolicy} />
				) : (
					<Field label={t('Who can join')}>
						<RadioGroup
							name="access"
							value={isOpen ? 'open' : 'invite'}
							onChange={(v) => setIsOpen(v === 'open')}
							options={[
								{
									value: 'open',
									label: t('Open'),
									description: t('Anyone with the link can join.')
								},
								{
									value: 'invite',
									label: t('Invite-only'),
									description: t(
										'People join only when a moderator invites them.'
									)
								}
							]}
						/>
					</Field>
				)}
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
