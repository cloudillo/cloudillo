// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	Button,
	IdentityTag,
	mergeClasses,
	ProfilePicture,
	ProfileSelect,
	QRCodeDialog,
	Tab,
	Tabs,
	TimeFormat,
	Toggle,
	useApi,
	useAuth,
	useDialog
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuCheck as IcAvailable,
	LuCopy as IcCopy,
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

	function copyUrlToClipboard() {
		navigator.clipboard.writeText(url)
	}

	function showQrCode() {
		setQrCode(url)
	}

	return (
		<div className="c-panel">
			<div className="c-hbox">
				<h2 className="fill">{invite.description || ''}</h2>
				<div className="c-hbox g-3">
					<Button
						kind="link"
						className={isEditing ? 'active' : undefined}
						aria-label={
							isEditing ? t('Cancel editing invitation') : t('Edit invitation')
						}
						aria-pressed={isEditing}
						onClick={() => (isEditing ? onCancelEdit() : onBeginEdit())}
					>
						<IcEdit />
					</Button>
					<Button kind="link" onClick={() => copyUrlToClipboard()}>
						<IcCopy />
					</Button>
					<Button kind="link" onClick={() => showQrCode()}>
						<IcQrCode />
					</Button>
					<Button kind="link" onClick={() => deleteRef()}>
						<IcDelete />
					</Button>
				</div>
			</div>
			<div className="c-hbox">
				<div className="c-hbox fill g-3 align-items-center">
					<span className="c-hbox g-1 align-items-center">
						<span className="text-secondary">{t('Created')}:</span>
						<TimeFormat time={invite.createdAt} />
					</span>
					{invite.expiresAt && (
						<span className="c-hbox g-1 align-items-center">
							<span className="text-secondary">{t('Expires')}:</span>
							<TimeFormat time={invite.expiresAt} />
						</span>
					)}
				</div>
				<div>
					{invite.count && (!invite.expiresAt || invite.expiresAt > new Date()) ? (
						<div className="c-hbox text-success g-0">
							<IcAvailable />
							{invite.count > 1 && <span>{invite.count}</span>}
						</div>
					) : (
						<IcUnavailable className="text-warning" />
					)}
				</div>
			</div>

			{isEditing && (
				<div
					className="c-panel mid p-3 mb-2"
					onKeyDown={(e) => {
						if (e.key === 'Escape') {
							e.stopPropagation()
							e.preventDefault()
							onCancelEdit()
						}
					}}
				>
					<div className="c-vbox g-2">
						<div className="c-hbox g-2 align-items-center">
							<label
								htmlFor={`invite-desc-${invite.refId}`}
								className="text-nowrap"
								style={{ minWidth: '80px' }}
							>
								{t('Label')}
							</label>
							<input
								id={`invite-desc-${invite.refId}`}
								type="text"
								className="c-input flex-fill"
								value={editDraft.description}
								onChange={(e) =>
									onEditDraftChange((d) => ({
										...d,
										description: e.target.value
									}))
								}
							/>
						</div>
						<div className="c-hbox g-2 align-items-center">
							<label
								htmlFor={`invite-expires-${invite.refId}`}
								className="text-nowrap"
								style={{ minWidth: '80px' }}
							>
								{t('Expires')}
							</label>
							<div className="c-hbox g-2 flex-fill align-items-center">
								<input
									id={`invite-expires-${invite.refId}`}
									type="date"
									className="c-input flex-fill"
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
							</div>
						</div>
						<div className="c-hbox g-2 align-items-center">
							<label
								htmlFor={`invite-count-${invite.refId}`}
								className="text-nowrap"
								style={{ minWidth: '80px' }}
							>
								{t('Max uses')}
							</label>
							<div className="c-hbox g-2 flex-fill align-items-center">
								<input
									id={`invite-count-${invite.refId}`}
									type="number"
									min={1}
									className="c-input flex-fill"
									value={editDraft.count}
									onChange={(e) =>
										onEditDraftChange((d) => ({
											...d,
											count: e.target.value,
											unlimitedCount: e.target.value
												? false
												: d.unlimitedCount
										}))
									}
									disabled={editDraft.unlimitedCount}
								/>
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
							</div>
						</div>
						<div className="c-hbox g-2 justify-content-end mt-2">
							<Button onClick={onCancelEdit}>{t('Cancel')}</Button>
							<Button variant="primary" onClick={onSaveEdit}>
								{t('Save')}
							</Button>
						</div>
					</div>
				</div>
			)}

			<QRCodeDialog
				value={qrCode}
				onClose={() => setQrCode(undefined)}
				title={t('Invitation link')}
			/>
		</div>
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
		<button
			type="button"
			className={mergeClasses(
				'c-card interactive flex-row align-items-center g-2 p-2 border-0',
				selected && 'primary'
			)}
			aria-pressed={selected}
			onClick={() => onToggle(community.idTag)}
			title={community.name}
		>
			<ProfilePicture
				className="flex-shrink-0"
				profile={{ profilePic: community.profilePic }}
				srcTag={community.idTag}
			/>
			<span className="c-vbox align-items-start" style={{ maxWidth: '12rem' }}>
				<span className="text-truncate w-100">{community.name}</span>
				<IdentityTag
					className="text-truncate w-100 small text-muted"
					idTag={community.idTag}
				/>
			</span>
			{selected && (
				<span className="c-badge accent positioned tr xs" aria-hidden>
					<IcAvailable size={12} />
				</span>
			)}
		</button>
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
				t('Are you sure you want to delete this invitation?')
			))
		)
			return

		await api.refs.delete(refId)
		setRefs((refs) => refs?.filter((ref) => ref.refId !== refId))
		if (editingRefId === refId) cancelEdit()
	}

	return (
		<>
			{showForm && (
				<div className="c-panel p-3 mb-3">
					<h3 className="mb-3">{t('Create invitation')}</h3>
					<div className="c-vbox g-3">
						<label className="c-vbox g-1">
							<span>{t('Label')}</span>
							<input
								type="text"
								className="c-input"
								value={newDescription}
								onChange={(e) => setNewDescription(e.target.value)}
								placeholder={t('Optional note to identify this invitation')}
							/>
						</label>

						<Toggle
							label={t('Auto-connect on signup')}
							checked={autoConnect}
							onChange={(e) => setAutoConnect(e.target.checked)}
						/>

						<div className="c-vbox g-2">
							<span>{t('Add to communities')}</span>

							{memberCommunities.length === 0 && (
								<span className="text-muted small">
									{t("You're not a member of any community yet.")}
								</span>
							)}

							{pinned.length > 0 && (
								<>
									<span className="text-muted small">{t('Pinned')}</span>
									<div className="c-hbox flex-wrap g-2">
										{pinned.map((c) => (
											<CommunityTile
												key={c.idTag}
												community={c}
												selected={selectedCommunities.has(c.idTag)}
												onToggle={toggleCommunity}
											/>
										))}
									</div>
								</>
							)}

							{more.length > 0 && (
								<>
									{pinned.length > 0 && (
										<span className="text-muted small">
											{t('More communities')}
										</span>
									)}
									<div className="c-hbox flex-wrap g-2">
										{more.map((c) => (
											<CommunityTile
												key={c.idTag}
												community={c}
												selected={selectedCommunities.has(c.idTag)}
												onToggle={toggleCommunity}
											/>
										))}
									</div>
								</>
							)}

							<span className="text-muted small">
								{t(
									'You can only invite to communities where you are a moderator; others are skipped.'
								)}
							</span>
						</div>

						<div className="c-hbox g-2 justify-content-end mt-2">
							<Button onClick={resetForm}>{t('Cancel')}</Button>
							<Button variant="primary" onClick={createRef} disabled={creating}>
								{t('Create')}
							</Button>
						</div>
					</div>
				</div>
			)}

			<div className="c-vbox">
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
			</div>
			{!showForm && (
				<button
					className="c-button primary float mb-5 me-2"
					onClick={() => setShowForm(true)}
				>
					<IcAdd />
				</button>
			)}
		</>
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
		<div className="c-panel p-3">
			<div className="c-hbox g-3 align-items-center">
				<div className="fill">
					<h3 className="m-0">{invite.description || invite.refId}</h3>
				</div>
				<span className={`c-badge ${isAvailable ? 'success' : 'warning'}`}>
					{isAvailable ? t('Active') : t('Used')}
				</span>
				<Button kind="link" onClick={onDelete}>
					<IcDelete />
				</Button>
			</div>
			<div className="c-vbox g-1 mt-2">
				<div className="c-hbox g-2 text-muted small">
					<span>{t('Created')}:</span>
					<TimeFormat time={invite.createdAt} />
				</div>
				{invite.expiresAt && (
					<div className="c-hbox g-2 text-muted small">
						<span>{t('Expires')}:</span>
						<TimeFormat time={invite.expiresAt} />
					</div>
				)}
			</div>
		</div>
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
				t('Are you sure you want to delete this invitation?')
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
		<>
			{showForm && (
				<div className="c-panel p-3 mb-3">
					<h3 className="mb-3">{t('Send community invite')}</h3>
					<label className="d-block mb-2">
						{t('Target user')}
						<ProfileSelect
							placeholder={t('Search user')}
							listProfiles={listProfiles}
							value={targetProfile}
							onChange={setTargetProfile}
						/>
					</label>
					<label className="d-block mb-2">
						{t('Message (optional)')}
						<textarea
							className="c-input px-3 py-2"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={t('Optional message for the recipient')}
							rows={2}
						/>
					</label>
					<label className="d-block mb-3">
						{t('Expires in')}
						<select
							className="c-input px-3"
							value={expiresInDays}
							onChange={(e) => setExpiresInDays(Number(e.target.value))}
						>
							<option value={7}>{t('{{count}} days', { count: 7 })}</option>
							<option value={30}>{t('{{count}} days', { count: 30 })}</option>
							<option value={90}>{t('{{count}} days', { count: 90 })}</option>
						</select>
					</label>
					<div className="c-hbox g-2">
						<Button
							className="primary"
							onClick={sendInvite}
							disabled={!targetProfile || sending}
						>
							<IcSend />
							{t('Send invite')}
						</Button>
						<Button className="container-secondary" onClick={() => setShowForm(false)}>
							{t('Cancel')}
						</Button>
					</div>
				</div>
			)}

			<div className="c-vbox g-2">
				{invites?.map((invite) => (
					<CommunityInviteCard
						key={invite.refId}
						invite={invite}
						onDelete={() => deleteInvite(invite.refId)}
					/>
				))}
				{invites && invites.length === 0 && !showForm && (
					<div className="c-panel text-muted text-center p-4">
						{t('No community invitations yet.')}
					</div>
				)}
			</div>

			{!showForm && (
				<button
					className="c-button primary float mb-5 me-2"
					onClick={() => setShowForm(true)}
				>
					<IcAdd />
				</button>
			)}
		</>
	)
}

// ============================================================================
// INVITATIONS (tabbed container)
// ============================================================================

export function Invitations() {
	const { t } = useTranslation()
	const [tab, setTab] = React.useState<string>('registration')

	return (
		<>
			<Tabs className="mb-3" value={tab} onTabChange={setTab}>
				<Tab value="registration">{t('Registration')}</Tab>
				<Tab value="community">{t('Community')}</Tab>
			</Tabs>

			{tab === 'registration' && <RegistrationInvites />}
			{tab === 'community' && <CommunityInvites />}
		</>
	)
}

// vim: ts=4
