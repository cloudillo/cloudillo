// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	Badge,
	Button,
	Card,
	Checkbox,
	CopyButton,
	DescriptionList,
	EmptyState,
	FAB,
	Field,
	Fieldset,
	HBox,
	IdentityTag,
	Input,
	NativeSelect,
	Panel,
	ProfilePicture,
	ProfileSelect,
	QRCodeDialog,
	Tab,
	Tabs,
	Text,
	TextArea,
	TimeFormat,
	Toggle,
	useApi,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuCheck as IcAvailable,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuQrCode as IcQrCode,
	LuSend as IcSend,
	LuX as IcUnavailable
} from 'react-icons/lu'

import { useCommunitiesList } from '../context/hooks.js'
import type { CommunityRef } from '../context/types.js'
import { dateInputToExpiryIso, formatRefDate, parseRefDate } from '../utils/parseRefDate.js'

// ============================================================================
// REGISTRATION INVITES (existing functionality)
// ============================================================================

interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count: number
}

interface EditDraft {
	description: string
	expiresAt: string
	neverExpires: boolean
	count: string
	unlimitedCount: boolean
}

interface RegistrationInviteCardProps {
	invite: Ref
	isEditing: boolean
	editDraft: EditDraft
	onEditDraftChange: React.Dispatch<React.SetStateAction<EditDraft>>
	onBeginEdit: () => void
	onCancelEdit: () => void
	onSaveEdit: () => void
	deleteRef: () => void
}

function RefDates({ createdAt, expiresAt }: { createdAt: Date; expiresAt?: Date }) {
	const { t } = useTranslation()
	return (
		<DescriptionList
			items={[
				{
					key: 'created',
					term: t('Created'),
					description: <TimeFormat time={createdAt} />
				},
				...(expiresAt
					? [
							{
								key: 'expires',
								term: t('Expires'),
								description: <TimeFormat time={expiresAt} />
							}
						]
					: [])
			]}
		/>
	)
}

function RegistrationInviteCard({
	invite,
	isEditing,
	editDraft,
	onEditDraftChange,
	onBeginEdit,
	onCancelEdit,
	onSaveEdit,
	deleteRef
}: RegistrationInviteCardProps) {
	const { t } = useTranslation()
	const [qrCode, setQrCode] = React.useState<string | undefined>()
	const url = `https://${location.host}/register/${invite.refId}`
	const available = !!invite.count && (!invite.expiresAt || invite.expiresAt > new Date())

	return (
		<Card
			title={invite.description || ''}
			actions={
				<HBox gap={1}>
					<Button
						variant="ghost"
						icon={<IcEdit />}
						pressed={isEditing}
						aria-label={
							isEditing ? t('Cancel editing invitation') : t('Edit invitation')
						}
						onClick={() => (isEditing ? onCancelEdit() : onBeginEdit())}
					/>
					<CopyButton text={url} label={t('Copy invitation link')} />
					<Button
						variant="ghost"
						icon={<IcQrCode />}
						aria-label={t('Show QR code')}
						onClick={() => setQrCode(url)}
					/>
					<Button
						variant="ghost"
						icon={<IcDelete />}
						aria-label={t('Delete invitation')}
						onClick={deleteRef}
					/>
				</HBox>
			}
		>
			<HBox gap={3} align="center" justify="between" wrap>
				<RefDates createdAt={invite.createdAt} expiresAt={invite.expiresAt} />
				{available ? (
					<Badge color="success" icon={<IcAvailable />}>
						{invite.count > 1
							? t('{{count}} uses left', { count: invite.count })
							: t('Active')}
					</Badge>
				) : (
					<Badge color="warning" icon={<IcUnavailable />}>
						{t('Used')}
					</Badge>
				)}
			</HBox>

			{isEditing && (
				<Panel
					padding={3}
					onKeyDown={(e) => {
						if (e.key === 'Escape') {
							e.stopPropagation()
							e.preventDefault()
							onCancelEdit()
						}
					}}
				>
					<VBox gap={2}>
						<Field
							orientation="horizontal"
							label={t('Label')}
							id={`invite-desc-${invite.refId}`}
						>
							<Input
								value={editDraft.description}
								onChange={(e) =>
									onEditDraftChange((d) => ({
										...d,
										description: e.target.value
									}))
								}
							/>
						</Field>
						<Field
							orientation="horizontal"
							label={t('Expires')}
							id={`invite-expires-${invite.refId}`}
						>
							<Input
								type="date"
								value={editDraft.expiresAt}
								onChange={(e) =>
									onEditDraftChange((d) => ({
										...d,
										expiresAt: e.target.value,
										neverExpires: e.target.value ? false : d.neverExpires
									}))
								}
								disabled={editDraft.neverExpires}
								min={dayjs().format('YYYY-MM-DD')}
							/>
						</Field>
						<Toggle
							label={t('Never')}
							checked={editDraft.neverExpires}
							onChange={(e) =>
								onEditDraftChange((d) => ({
									...d,
									neverExpires: e.target.checked,
									expiresAt: e.target.checked ? '' : d.expiresAt
								}))
							}
						/>
						<Field
							orientation="horizontal"
							label={t('Max uses')}
							id={`invite-count-${invite.refId}`}
						>
							<Input
								type="number"
								min={1}
								value={editDraft.count}
								onChange={(e) =>
									onEditDraftChange((d) => ({
										...d,
										count: e.target.value,
										unlimitedCount: e.target.value ? false : d.unlimitedCount
									}))
								}
								disabled={editDraft.unlimitedCount}
							/>
						</Field>
						<Toggle
							label={t('Unlimited')}
							checked={editDraft.unlimitedCount}
							onChange={(e) =>
								onEditDraftChange((d) => ({
									...d,
									unlimitedCount: e.target.checked,
									count: e.target.checked ? '' : d.count
								}))
							}
						/>
						<HBox gap={2} justify="end">
							<Button onClick={onCancelEdit}>{t('Cancel')}</Button>
							<Button color="primary" onClick={onSaveEdit}>
								{t('Save')}
							</Button>
						</HBox>
					</VBox>
				</Panel>
			)}

			<QRCodeDialog
				value={qrCode}
				onClose={() => setQrCode(undefined)}
				title={t('Invitation link')}
			/>
		</Card>
	)
}

function CommunityTile({
	community,
	selected,
	onToggle
}: {
	community: CommunityRef
	selected: boolean
	onToggle: (idTag: string) => void
}) {
	return (
		<Checkbox
			variant="card"
			leading={
				<ProfilePicture
					size="sm"
					profile={{ profilePic: community.profilePic }}
					srcTag={community.idTag}
				/>
			}
			label={community.name}
			description={<IdentityTag idTag={community.idTag} />}
			checked={selected}
			onChange={() => onToggle(community.idTag)}
		/>
	)
}

function RegistrationInvites() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const {
		communities: memberCommunities,
		favorites: pinned,
		pinnedIdTags,
		loadCommunities
	} = useCommunitiesList()
	const [refs, setRefs] = React.useState<Ref[] | undefined>()
	const [editingRefId, setEditingRefId] = React.useState<string | null>(null)
	const [editDraft, setEditDraft] = React.useState<EditDraft>({
		description: '',
		expiresAt: '',
		neverExpires: true,
		count: '1',
		unlimitedCount: false
	})
	// Create-invite form state
	const [showForm, setShowForm] = React.useState(false)
	const [newDescription, setNewDescription] = React.useState('')
	const [autoConnect, setAutoConnect] = React.useState(true)
	const [selectedCommunities, setSelectedCommunities] = React.useState<Set<string>>(new Set())
	const [creating, setCreating] = React.useState(false)

	React.useEffect(() => {
		if (memberCommunities.length === 0) loadCommunities()
		// load only on first mount; deps intentionally omitted
	}, [])

	const more = React.useMemo(
		() => memberCommunities.filter((c) => !pinnedIdTags.includes(c.idTag)),
		[pinnedIdTags, memberCommunities]
	)

	React.useEffect(
		function loadRefs() {
			if (!auth || !api) return
			;(async function () {
				const res = await api.refs.list({ type: 'register' })
				if (Array.isArray(res))
					setRefs(
						res.map((ref) => ({
							...ref,
							createdAt: new Date(ref.createdAt),
							expiresAt: parseRefDate(ref.expiresAt),
							count: ref.count ?? 0
						}))
					)
			})()
		},
		[auth, api]
	)

	function toggleCommunity(idTag: string) {
		setSelectedCommunities((prev) => {
			const next = new Set(prev)
			if (next.has(idTag)) {
				next.delete(idTag)
			} else {
				next.add(idTag)
			}
			return next
		})
	}

	function resetForm() {
		setShowForm(false)
		setNewDescription('')
		setAutoConnect(true)
		setSelectedCommunities(new Set())
	}

	async function createRef() {
		if (!api) return
		setCreating(true)
		try {
			const params = new URLSearchParams()
			// Opt-out: only persist the flag when auto-connect is disabled. Absence of
			// `connect` means auto-connect, so pre-existing refs (no flag) auto-connect.
			if (!autoConnect) params.set('connect', '0')
			if (selectedCommunities.size) {
				params.set('communities', Array.from(selectedCommunities).join(','))
			}
			const res = await api.refs.create({
				type: 'register',
				description: newDescription.trim() || undefined,
				count: 1,
				params: params.toString() || undefined
			})
			if (res) {
				setRefs((refs) => [
					{
						...res,
						createdAt: new Date(res.createdAt),
						expiresAt: parseRefDate(res.expiresAt),
						count: res.count ?? 0
					},
					...(refs || [])
				])
			}
			resetForm()
		} catch (err) {
			await dialog.tell(
				t('Failed to create invitation'),
				err instanceof Error ? err.message : String(err)
			)
		} finally {
			setCreating(false)
		}
	}

	function beginEdit(ref: Ref) {
		setEditDraft({
			description: ref.description ?? '',
			expiresAt: formatRefDate(ref.expiresAt) ?? '',
			neverExpires: !ref.expiresAt,
			count: ref.count ? String(ref.count) : '',
			unlimitedCount: !ref.count
		})
		setEditingRefId(ref.refId)
	}

	function cancelEdit() {
		setEditingRefId(null)
		setEditDraft({
			description: '',
			expiresAt: '',
			neverExpires: true,
			count: '1',
			unlimitedCount: false
		})
	}

	async function saveEdit(ref: Ref) {
		if (!api) return
		const patch: Types.UpdateRefRequest = {}

		if (editDraft.description !== (ref.description ?? '')) {
			patch.description = editDraft.description
		}

		if (!editDraft.neverExpires && editDraft.expiresAt === '') {
			await dialog.tell(t('Invalid expiry'), t('Pick an expiry date, or check Never'))
			return
		}
		const draftExpires: string | null = editDraft.neverExpires
			? null
			: (dateInputToExpiryIso(editDraft.expiresAt) ?? null)
		const currentExp = ref.expiresAt ? ref.expiresAt.toISOString() : null
		if (draftExpires !== currentExp) patch.expiresAt = draftExpires

		if (!editDraft.unlimitedCount && editDraft.count.trim() === '') {
			await dialog.tell(
				t('Invalid max uses'),
				t('Enter a max-uses value, or check Unlimited')
			)
			return
		}
		const draftCount: number | null = editDraft.unlimitedCount
			? null
			: Number.parseInt(editDraft.count, 10)
		if (draftCount !== null && (Number.isNaN(draftCount) || draftCount < 1)) {
			await dialog.tell(t('Invalid max uses'), t('Max uses must be at least 1'))
			return
		}
		const currentCount = ref.count > 0 ? ref.count : null
		if (draftCount !== currentCount) patch.count = draftCount

		if (Object.keys(patch).length === 0) {
			setEditingRefId(null)
			return
		}

		try {
			const updated = await api.refs.update(ref.refId, patch)
			setRefs((refs) =>
				refs?.map((r) =>
					r.refId === ref.refId
						? {
								...updated,
								createdAt: new Date(updated.createdAt),
								expiresAt: parseRefDate(updated.expiresAt),
								count: updated.count ?? 0
							}
						: r
				)
			)
			setEditingRefId(null)
			setEditDraft({
				description: '',
				expiresAt: '',
				neverExpires: true,
				count: '1',
				unlimitedCount: false
			})
		} catch (err) {
			await dialog.tell(
				t('Failed to update invitation'),
				err instanceof Error ? err.message : String(err)
			)
		}
	}

	async function deleteRef(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Delete invitation'),
				t('Are you sure you want to delete this invitation?'),
				{ color: 'error', confirmLabel: t('Delete') }
			))
		)
			return

		await api.refs.delete(refId)
		setRefs((refs) => refs?.filter((ref) => ref.refId !== refId))
		if (editingRefId === refId) cancelEdit()
	}

	return (
		<VBox gap={3}>
			{showForm && (
				<Panel title={t('Create invitation')}>
					<VBox gap={3}>
						<Field label={t('Label')} id="invite-new-desc">
							<Input
								value={newDescription}
								onChange={(e) => setNewDescription(e.target.value)}
								placeholder={t('Optional note to identify this invitation')}
							/>
						</Field>

						<Toggle
							label={t('Auto-connect on signup')}
							checked={autoConnect}
							onChange={(e) => setAutoConnect(e.target.checked)}
						/>

						<Fieldset legend={t('Add to communities')}>
							<VBox gap={2}>
								{memberCommunities.length === 0 && (
									<Text size="sm" emphasis="muted">
										{t("You're not a member of any community yet.")}
									</Text>
								)}

								{pinned.length > 0 && (
									<>
										<Text size="sm" emphasis="muted">
											{t('Pinned')}
										</Text>
										<HBox gap={2} wrap>
											{pinned.map((c) => (
												<CommunityTile
													key={c.idTag}
													community={c}
													selected={selectedCommunities.has(c.idTag)}
													onToggle={toggleCommunity}
												/>
											))}
										</HBox>
									</>
								)}

								{more.length > 0 && (
									<>
										{pinned.length > 0 && (
											<Text size="sm" emphasis="muted">
												{t('More communities')}
											</Text>
										)}
										<HBox gap={2} wrap>
											{more.map((c) => (
												<CommunityTile
													key={c.idTag}
													community={c}
													selected={selectedCommunities.has(c.idTag)}
													onToggle={toggleCommunity}
												/>
											))}
										</HBox>
									</>
								)}

								<Text size="sm" emphasis="muted">
									{t(
										'You can only invite to communities where you are a moderator; others are skipped.'
									)}
								</Text>
							</VBox>
						</Fieldset>

						<HBox gap={2} justify="end">
							<Button onClick={resetForm}>{t('Cancel')}</Button>
							<Button color="primary" onClick={createRef} loading={creating}>
								{t('Create')}
							</Button>
						</HBox>
					</VBox>
				</Panel>
			)}

			{refs?.map((ref) => (
				<RegistrationInviteCard
					key={ref.refId}
					invite={ref}
					isEditing={editingRefId === ref.refId}
					editDraft={editDraft}
					onEditDraftChange={setEditDraft}
					onBeginEdit={() => beginEdit(ref)}
					onCancelEdit={cancelEdit}
					onSaveEdit={() => saveEdit(ref)}
					deleteRef={() => deleteRef(ref.refId)}
				/>
			))}
			{!showForm && (
				<FAB
					icon={<IcAdd />}
					aria-label={t('Create invitation')}
					onClick={() => setShowForm(true)}
				/>
			)}
		</VBox>
	)
}

// ============================================================================
// COMMUNITY INVITES
// ============================================================================

interface CommunityInviteRef {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count?: number
}

function CommunityInviteCard({
	invite,
	onDelete
}: {
	invite: CommunityInviteRef
	onDelete: () => void
}) {
	const { t } = useTranslation()

	const isAvailable =
		(invite.count === undefined || invite.count > 0) &&
		(!invite.expiresAt || invite.expiresAt > new Date())

	return (
		<Card
			title={invite.description || invite.refId}
			actions={
				<HBox gap={2} align="center">
					<Badge color={isAvailable ? 'success' : 'warning'}>
						{isAvailable ? t('Active') : t('Used')}
					</Badge>
					<Button
						variant="ghost"
						icon={<IcDelete />}
						aria-label={t('Delete invitation')}
						onClick={onDelete}
					/>
				</HBox>
			}
		>
			<RefDates createdAt={invite.createdAt} expiresAt={invite.expiresAt} />
		</Card>
	)
}

function CommunityInvites() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [invites, setInvites] = React.useState<CommunityInviteRef[] | undefined>()
	const [showForm, setShowForm] = React.useState(false)
	const [targetProfile, setTargetProfile] = React.useState<Profile | undefined>()
	const [message, setMessage] = React.useState('')
	const [expiresInDays, setExpiresInDays] = React.useState(30)
	const [sending, setSending] = React.useState(false)

	React.useEffect(
		function loadInvites() {
			if (!auth || !api) return
			;(async function () {
				try {
					const res = await api.refs.list({ type: 'profile.invite' })
					if (Array.isArray(res)) {
						setInvites(
							res.map((ref) => ({
								...ref,
								createdAt: new Date(ref.createdAt),
								expiresAt: parseRefDate(ref.expiresAt)
							}))
						)
					}
				} catch (err) {
					console.log('Error loading community invites:', err)
					setInvites([])
				}
			})()
		},
		[auth, api]
	)

	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		return api.profiles.list({ connected: true, q })
	}

	async function sendInvite() {
		if (!api || !targetProfile) return

		setSending(true)
		try {
			const res = await api.admin.inviteCommunity({
				targetIdTag: targetProfile.idTag,
				message: message.trim() || undefined,
				expiresInDays
			})

			// Add the new invite to the list
			setInvites((prev) => [
				{
					refId: res.refId,
					type: 'profile.invite',
					description: res.targetIdTag,
					createdAt: new Date(),
					expiresAt: res.expiresAt ? new Date(res.expiresAt * 1000) : undefined,
					count: 1
				},
				...(prev || [])
			])

			// Reset form
			setTargetProfile(undefined)
			setMessage('')
			setShowForm(false)
		} catch (err) {
			console.error('Error sending community invite:', err)
			await dialog.tell(
				t('Failed to send invitation'),
				err instanceof Error ? err.message : String(err)
			)
		} finally {
			setSending(false)
		}
	}

	async function deleteInvite(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Delete invitation'),
				t('Are you sure you want to delete this invitation?'),
				{ color: 'error', confirmLabel: t('Delete') }
			))
		)
			return

		try {
			await api.refs.delete(refId)
			setInvites((prev) => prev?.filter((inv) => inv.refId !== refId))
		} catch (err) {
			console.error('Error deleting community invite:', err)
			await dialog.tell(
				t('Failed to delete invitation'),
				err instanceof Error ? err.message : String(err)
			)
		}
	}

	return (
		<VBox gap={3}>
			{showForm && (
				<Panel title={t('Send community invite')}>
					<VBox gap={3}>
						<Fieldset legend={t('Target user')}>
							<ProfileSelect
								placeholder={t('Search user')}
								listProfiles={listProfiles}
								value={targetProfile}
								onChange={setTargetProfile}
							/>
						</Fieldset>
						<Field label={t('Message (optional)')} id="community-invite-message">
							<TextArea
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								placeholder={t('Optional message for the recipient')}
								rows={2}
							/>
						</Field>
						<Field label={t('Expires in')} id="community-invite-expires">
							<NativeSelect
								value={expiresInDays}
								onChange={(e) => setExpiresInDays(Number(e.target.value))}
							>
								<option value={7}>{t('{{count}} days', { count: 7 })}</option>
								<option value={30}>{t('{{count}} days', { count: 30 })}</option>
								<option value={90}>{t('{{count}} days', { count: 90 })}</option>
							</NativeSelect>
						</Field>
						<HBox gap={2} justify="end">
							<Button onClick={() => setShowForm(false)}>{t('Cancel')}</Button>
							<Button
								color="primary"
								icon={<IcSend />}
								onClick={sendInvite}
								disabled={!targetProfile}
								loading={sending}
							>
								{t('Send invite')}
							</Button>
						</HBox>
					</VBox>
				</Panel>
			)}

			{invites?.map((invite) => (
				<CommunityInviteCard
					key={invite.refId}
					invite={invite}
					onDelete={() => deleteInvite(invite.refId)}
				/>
			))}
			{invites && invites.length === 0 && !showForm && (
				<EmptyState className="auto-bg" title={t('No community invitations yet.')} />
			)}

			{!showForm && (
				<FAB
					icon={<IcAdd />}
					aria-label={t('Send community invite')}
					onClick={() => setShowForm(true)}
				/>
			)}
		</VBox>
	)
}

// ============================================================================
// INVITATIONS (tabbed container)
// ============================================================================

export function Invitations() {
	const { t } = useTranslation()
	const [tab, setTab] = React.useState<string>('registration')

	return (
		<VBox gap={3} autoBg>
			<Tabs value={tab} onTabChange={setTab}>
				<Tab value="registration">{t('Registration')}</Tab>
				<Tab value="community">{t('Community')}</Tab>
			</Tabs>

			{tab === 'registration' && <RegistrationInvites />}
			{tab === 'community' && <CommunityInvites />}
		</VBox>
	)
}

// vim: ts=4
