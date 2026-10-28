// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	Field,
	IcBack,
	IcNext,
	Input,
	ProfileMultiSelect,
	Segmented,
	SegmentedItem,
	Text,
	TextArea,
	Toggle,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import { type CommunityRole, type Profile, ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { activeContextAtom } from '../../../context/atoms.js'
import { useContextRolesFor } from '../../../context/hooks.js'
import { useCtx } from '../../../context/index.js'
import { IcGroup } from '../../../icons.js'
import { floorText } from '../../../profile/role-labels.js'
import { CommunityGroupsBrowser } from '../details/CommunityGroupsBrowser.js'
import { type JoinPolicy, JoinPolicyField } from '../details/GroupSettingsDialog.js'
import { listConnectedPeople, sendInvites } from '../utils.js'

type Access = 'invite' | 'open'

export interface NewChatDialogProps {
	onClose: () => void
	/** One person picked: open the DM with them (existing or new — DM convId = peer idTag). */
	onOpenDirect: (idTag: string) => void
	/** Group created or joined (CONV id); the caller reloads the inbox and navigates. */
	onCreated: (convId: string) => void
	/** Where a group is created. Default: the active community context, else 'personal'. */
	target?: 'personal' | { communityTag: string }
}

const isForbidden = (err: unknown) => (err as { httpStatus?: number })?.httpStatus === 403

// The single "New chat" flow: pick connections; one pick opens the DM, two or more go
// to the group step (name, description, access mode), which creates the CONV, then INVTs.
// In a community context the group is created in that community: CONV on the
// community node, then the home-node admin SUBS, then INVTs via the community node.
// Mounted only while open, so every open starts from a clean state.
export function NewChatDialog({ onClose, onOpenDirect, onCreated, target }: NewChatDialogProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const ctx = useCtx()
	const activeContext = useAtomValue(activeContextAtom)

	const contextTag = !ctx.isHome ? activeContext?.idTag : undefined
	const communityTag =
		target === undefined ? contextTag : target === 'personal' ? undefined : target.communityTag
	const { api: communityApi } = useApi(communityTag)
	const level = roleLevel(useContextRolesFor(communityTag))
	const member = !!communityTag && level > ROLE_LEVELS.follower

	const [picked, setPicked] = React.useState<Profile[]>([])
	const [step, setStep] = React.useState<'pick' | 'group' | 'browse'>('pick')
	const [name, setName] = React.useState('')
	const [description, setDescription] = React.useState('')
	const [access, setAccess] = React.useState<Access>('invite')
	const [policy, setPolicy] = React.useState<JoinPolicy>({ join: 'request' })
	const [personal, setPersonal] = React.useState(false)
	// `conv.create_min_role` on the community node; undefined while unknown or unreadable.
	const [minCreateRole, setMinCreateRole] = React.useState<CommunityRole>()
	// The community refused a create (403): explain instead of offering it again.
	const [refused, setRefused] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState(false)
	// Group created but some invites failed: stay open so the user sees who was missed.
	const [created, setCreated] = React.useState<{ convId: string; failed: Profile[] }>()
	// Community CONV created but the home-node admin SUBS failed: "Finish setting up" retries.
	const [setupPending, setSetupPending] = React.useState<string>()

	React.useEffect(() => {
		if (!communityApi || !member) return
		let live = true
		// a non-leader may not be allowed to read the setting; then the create is
		// attempted and a 403 turns into the explanation line.
		communityApi.settings
			.get('conv.create_min_role')
			.then((s) => {
				if (live && typeof s.value === 'string') setMinCreateRole(s.value as CommunityRole)
			})
			.catch(() => {})
		return () => {
			live = false
		}
	}, [communityApi, member])

	const canCreateInCommunity =
		member && !refused && (!minCreateRole || level >= ROLE_LEVELS[minCreateRole])
	const inCommunity = canCreateInCommunity && !personal

	// Server-side typeahead source (connected people, self excluded); the Combobox debounces.
	const listProfiles = (q: string) => listConnectedPeople(api, q, [auth?.idTag])

	async function invite(client: ApiClient, convId: string, groupName: string) {
		const failed = await sendInvites(client, convId, groupName, picked)
		if (failed.length) setCreated({ convId, failed })
		else onCreated(convId)
	}

	// Second create call: the creator's home-node SUBS, which the community stamps as admin.
	async function finishSetup(convId: string) {
		if (!api || !communityApi || !communityTag) return
		try {
			await api.actions.create({ type: 'SUBS', subject: convId, audienceTag: communityTag })
		} catch (err) {
			console.error('Failed to join the new community group', err)
			setSetupPending(convId)
			return
		}
		setSetupPending(undefined)
		await invite(communityApi, convId, name.trim())
	}

	async function createGroup() {
		const groupName = name.trim()
		if (!api || !groupName) return
		setBusy(true)
		setError(false)
		try {
			if (inCommunity && communityApi) {
				let convId: string
				try {
					const conv = await communityApi.actions.create({
						type: 'CONV',
						content: {
							name: groupName,
							description: description.trim() || undefined,
							...policy
						}
					})
					convId = conv.actionId
				} catch (err) {
					if (!isForbidden(err)) throw err
					setRefused(true)
					return
				}
				await finishSetup(convId)
				return
			}
			const conv = await api.actions.create({
				type: 'CONV',
				// 'O' = open (joinable without invitation); no flags keeps it invite-only.
				flags: access === 'open' ? 'O' : undefined,
				content: { name: groupName, description: description.trim() || undefined }
			})
			await invite(api, conv.actionId, groupName)
		} catch (err) {
			console.error('Failed to create group', err)
			setError(true)
		} finally {
			setBusy(false)
		}
	}

	async function retrySetup() {
		if (!setupPending) return
		setBusy(true)
		try {
			await finishSetup(setupPending)
		} finally {
			setBusy(false)
		}
	}

	let footer: React.ReactNode
	if (created) {
		footer = (
			<Button color="primary" onClick={() => onCreated(created.convId)}>
				{t('Open group')}
			</Button>
		)
	} else if (setupPending) {
		footer = (
			<>
				<Button disabled={busy} onClick={onClose}>
					{t('Close')}
				</Button>
				<Button color="primary" loading={busy} onClick={retrySetup}>
					{t('Finish setting up')}
				</Button>
			</>
		)
	} else if (step === 'browse') {
		footer = (
			<Button icon={<IcBack />} onClick={() => setStep('pick')}>
				{t('Back')}
			</Button>
		)
	} else if (step === 'pick') {
		footer = (
			<>
				{member && communityTag && (
					<Button variant="ghost" icon={<IcGroup />} onClick={() => setStep('browse')}>
						{t('Browse community groups')}
					</Button>
				)}
				<Button onClick={onClose}>{t('Cancel')}</Button>
				{picked.length > 1 ? (
					<Button color="primary" icon={<IcNext />} onClick={() => setStep('group')}>
						{t('Next')}
					</Button>
				) : (
					<Button
						color="primary"
						disabled={!picked.length}
						onClick={() => picked[0] && onOpenDirect(picked[0].idTag)}
					>
						{t('Open chat')}
					</Button>
				)}
			</>
		)
	} else {
		footer = (
			<>
				<Button icon={<IcBack />} disabled={busy} onClick={() => setStep('pick')}>
					{t('Back')}
				</Button>
				<Button
					color="primary"
					disabled={!name.trim()}
					loading={busy}
					onClick={createGroup}
				>
					{t('Create group')}
				</Button>
			</>
		)
	}

	let body: React.ReactNode
	if (created) {
		body = (
			<Alert color="warning" title={t('Group created')}>
				{t('These invitations could not be sent: {{names}}', {
					names: created.failed.map((p) => p.name || p.idTag).join(', ')
				})}
			</Alert>
		)
	} else if (setupPending) {
		body = (
			<Alert color="warning" title={t('Group created')}>
				{t('You are not in the group yet. Finish setting up to join it as its admin.')}
			</Alert>
		)
	} else if (step === 'browse' && communityTag) {
		body = <CommunityGroupsBrowser communityTag={communityTag} onJoined={onCreated} />
	} else if (step === 'pick') {
		body = (
			<VBox gap={2}>
				<ProfileMultiSelect
					placeholder={t('Search contacts...')}
					emptyText={t('Pick one person to message, or several to start a group')}
					listProfiles={listProfiles}
					value={picked}
					onAdd={(p) => setPicked((prev) => [...prev, p])}
					onRemove={(p) => setPicked((prev) => prev.filter((m) => m.idTag !== p.idTag))}
				/>
			</VBox>
		)
	} else {
		body = (
			<VBox gap={3}>
				{error && (
					<Alert color="error" compact>
						{t('Could not create the group. Please try again.')}
					</Alert>
				)}
				{member &&
					(canCreateInCommunity ? (
						<Toggle
							color="primary"
							checked={personal}
							onChange={(e) => setPersonal(e.target.checked)}
							label={t('Personal group instead')}
							description={
								personal
									? t('The group belongs to you, not to @{{community}}.', {
											community: communityTag
										})
									: t('The group is created in @{{community}}.', {
											community: communityTag
										})
							}
						/>
					) : (
						<Text as="p" size="sm" emphasis="muted">
							{minCreateRole
								? t(
										'{{who}} can create group chats in @{{community}}. This one will be a personal group.',
										{
											who: floorText(t, minCreateRole),
											community: communityTag
										}
									)
								: t(
										'Your role in @{{community}} can’t create group chats there. This one will be a personal group.',
										{ community: communityTag }
									)}
						</Text>
					))}
				<Field label={t('Group name')} required>
					<Input
						placeholder={t('Enter group name...')}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
				</Field>
				<Field label={t('Description')}>
					<TextArea
						placeholder={t('Optional description...')}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={2}
					/>
				</Field>
				{inCommunity ? (
					<JoinPolicyField value={policy} onChange={setPolicy} />
				) : (
					<Field label={t('Access')}>
						<Segmented
							fill
							aria-label={t('Access')}
							value={access}
							onChange={(v) => setAccess(v as Access)}
						>
							<SegmentedItem value="invite">{t('Invite-only')}</SegmentedItem>
							<SegmentedItem value="open">{t('Open')}</SegmentedItem>
						</Segmented>
						<Text as="p" size="sm" emphasis="muted" className="mt-1">
							{access === 'open'
								? t('Anyone who can see this group can join')
								: t('People join only when invited')}
						</Text>
					</Field>
				)}
			</VBox>
		)
	}

	return (
		<Dialog
			open
			onClose={created ? () => onCreated(created.convId) : onClose}
			size="sm"
			title={
				step === 'pick'
					? t('New chat')
					: step === 'browse'
						? t('Community group chats')
						: t('New group')
			}
			footer={<ActionBar>{footer}</ActionBar>}
		>
			{body}
		</Dialog>
	)
}

// vim: ts=4
