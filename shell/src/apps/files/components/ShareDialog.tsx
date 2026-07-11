// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	Button,
	Popper,
	ProfileCard,
	ProfileMultiSelect,
	QRCodeDialog,
	Toggle,
	useAuth,
	useToast
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuCopy as IcCopy,
	LuChevronRight as IcDisclosure,
	LuLink as IcLink,
	LuEllipsisVertical as IcMore,
	LuPencil as IcPencil,
	LuPlus as IcPlus,
	LuQrCode as IcQrCode,
	LuTrash2 as IcTrash
} from 'react-icons/lu'

import {
	activeContextAtom,
	useContextAwareApi,
	useCurrentContextIdTag
} from '../../../context/index.js'
import { useShareOrigin } from '../../../utils/appOrigin.js'
import { dateInputToExpiryIso, formatRefDate, parseRefDate } from '../../../utils/parseRefDate.js'
import { getCachedProfile, getCachedProfiles } from '../../../utils/profileCache.js'
import { getFileIcon, IcUnknown } from '../icons.js'
import type { File } from '../types.js'
import { canManageFile } from '../utils.js'
import { AccessLevelMenu } from './AccessLevelMenu.js'

type PermLevel = 'READ' | 'COMMENT' | 'WRITE'
type LinkLevel = 'read' | 'comment' | 'write'

const PERM_CHAR: Record<PermLevel, string> = {
	READ: 'R',
	COMMENT: 'C',
	WRITE: 'W'
}

function permCharToLevel(perm: string): PermLevel {
	if (perm === 'W' || perm === 'A') return 'WRITE'
	if (perm === 'C') return 'COMMENT'
	return 'READ'
}

export interface ShareDialogProps {
	open: boolean
	file: File
	onClose: () => void
	onPermissionsChanged?: () => void
}

export function ShareDialog({ open, file, onClose, onPermissionsChanged }: ShareDialogProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const contextIdTag = useCurrentContextIdTag()
	const toast = useToast()

	// Share URLs must point at the tenant that holds the ref (file owner, or
	// the active context) — its app/web domain, not the API host.
	const shareHostIdTag = file.owner?.idTag ?? contextIdTag
	const shareOrigin = useShareOrigin(api, shareHostIdTag) ?? window.location.origin

	const dialogRef = React.useRef<HTMLDivElement>(null)

	// People state
	const [confirmingRemovePerm, setConfirmingRemovePerm] = React.useState<string | null>(null)
	const [defaultAddLevel, setDefaultAddLevel] = React.useState<PermLevel>('READ')
	// Profile lookup for share-entry subjectIds. Populated lazily after share
	// entries load; missing entries render with a minimal {idTag} fallback.
	const [peopleProfiles, setPeopleProfiles] = React.useState<Record<string, Profile>>({})
	const [ownerProfile, setOwnerProfile] = React.useState<Profile | null>(null)

	// Link state
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[]>([])
	const [loadingRefs, setLoadingRefs] = React.useState(false)
	const [newLinkAccess, setNewLinkAccess] = React.useState<LinkLevel>('read')
	const [newLinkLabel, setNewLinkLabel] = React.useState('')
	const [newLinkExpires, setNewLinkExpires] = React.useState('')
	const [neverExpires, setNeverExpires] = React.useState(true)
	const [creatingLink, setCreatingLink] = React.useState(false)
	const [createError, setCreateError] = React.useState<string | null>(null)
	const [confirmingDeleteRef, setConfirmingDeleteRef] = React.useState<string | null>(null)
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()
	const [createLinkOpen, setCreateLinkOpen] = React.useState(false)
	const [editingRefId, setEditingRefId] = React.useState<string | null>(null)
	const [editDraft, setEditDraft] = React.useState<{
		description: string
		expiresAt: string
		neverExpires: boolean
	}>({ description: '', expiresAt: '', neverExpires: true })

	// User-share entries (subjectType='U'): source of truth for per-person permission.
	const [userShareEntries, setUserShareEntries] = React.useState<Types.ShareEntry[]>([])
	// File-share entries (subjectType='F'): "Used in N documents" footer.
	const [fileShareEntries, setFileShareEntries] = React.useState<Types.ShareEntry[]>([])
	const [loadingEntries, setLoadingEntries] = React.useState(false)
	const [confirmingDeleteEntry, setConfirmingDeleteEntry] = React.useState<number | null>(null)

	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isOwner = canManageFile(file, auth?.idTag, activeContext?.roles ?? [])
	// Backend convention: missing fileTp defaults to BLOB (immutable)
	const isImmutable = file.fileTp === 'BLOB' || file.fileTp == null
	const disabledLevels: PermLevel[] = isImmutable ? ['WRITE'] : []

	// Unified people list, alphabetized by resolved profile name (falls back to
	// idTag while the profile is still loading). Re-sorts once names arrive.
	const allPeople = React.useMemo(() => {
		function key(e: Types.ShareEntry) {
			const idTag = e.subjectId.toString()
			return (peopleProfiles[idTag]?.name ?? idTag).toLowerCase()
		}
		return [...userShareEntries].sort((a, b) => key(a).localeCompare(key(b)))
	}, [userShareEntries, peopleProfiles])

	// Profile objects for the people list; falls back to a minimal {idTag}
	// profile while the real one is still loading.
	const allPeopleProfiles = React.useMemo(
		() =>
			allPeople.map((entry) => {
				const idTag = entry.subjectId.toString()
				return peopleProfiles[idTag] ?? { idTag, name: idTag }
			}),
		[allPeople, peopleProfiles]
	)

	// Load data when dialog opens
	React.useEffect(
		function loadShareData() {
			if (!api || !open) return

			let cancelled = false

			;(async function () {
				setLoadingRefs(true)

				try {
					const refs = await api.refs.list({
						type: 'share.file',
						resourceId: file.fileId
					})
					if (!cancelled) setShareRefs(refs)
				} catch (err) {
					console.error('Failed to load share links', err)
				} finally {
					if (!cancelled) setLoadingRefs(false)
				}

				let userEntries: Types.ShareEntry[] = []
				try {
					if (!cancelled) setLoadingEntries(true)
					const allEntries = await api.files.listShares(file.fileId)
					if (!cancelled) {
						userEntries = allEntries.filter((e) => e.subjectType === 'U')
						setUserShareEntries(userEntries)
						setFileShareEntries(allEntries.filter((e) => e.subjectType === 'F'))
					}
				} catch (err) {
					console.error('Failed to load share entries', err)
				} finally {
					if (!cancelled) setLoadingEntries(false)
				}

				// Enrich the people list with profile data (name, profile pic).
				// Missing or unreachable profiles fall back to {idTag} at render.
				if (!cancelled && userEntries.length > 0) {
					const idTags = Array.from(
						new Set(userEntries.map((e) => e.subjectId.toString()))
					)
					const profiles = await getCachedProfiles(api, idTags)
					if (!cancelled) setPeopleProfiles(profiles)
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[api, open, file.fileId]
	)

	async function listProfiles(q: string) {
		if (!api || !q) return []
		return api.profiles.list({ type: 'person', q })
	}

	async function addPerm(profile: Profile, perm: PermLevel) {
		if (!file || !api) return

		try {
			// createShare creates the share_entry AND emits an FSHR notification
			// for federation (handled server-side). One round-trip, one source of
			// truth.
			const entry = await api.files.createShare(file.fileId, {
				subjectType: 'U',
				subjectId: profile.idTag,
				permission: PERM_CHAR[perm]
			})
			setUserShareEntries((prev) => [
				...prev.filter((e) => e.subjectId.toString() !== profile.idTag),
				entry
			])
			setPeopleProfiles((prev) => ({ ...prev, [profile.idTag]: profile }))
			toast.success(t('Permission granted'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to add permission', err)
			toast.error(t('Failed to grant permission'))
		}
	}

	async function changePerm(idTag: string, newLevel: PermLevel) {
		if (!api) return
		const entry = userShareEntries.find(
			(e) => e.subjectType === 'U' && e.subjectId.toString() === idTag
		)
		if (!entry) return
		const newPerm = PERM_CHAR[newLevel]
		if (entry.permission === newPerm) return

		try {
			const updated = await api.files.updateShare(file.fileId, entry.id, {
				permission: newPerm
			})
			setUserShareEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)))
			toast.success(t('Permission updated'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to update permission', err)
			toast.error(t('Failed to update permission'))
		}
	}

	function levelFor(idTag: string): PermLevel {
		const entry = userShareEntries.find(
			(e) => e.subjectType === 'U' && e.subjectId.toString() === idTag
		)
		return permCharToLevel(entry?.permission.toString() ?? 'R')
	}

	function requestRemovePerm(idTag: string) {
		setConfirmingRemovePerm(idTag)
	}

	function cancelRemovePerm() {
		setConfirmingRemovePerm(null)
	}

	async function confirmRemovePerm(idTag: string) {
		if (!file || !api) return

		const entry = userShareEntries.find(
			(e) => e.subjectType === 'U' && e.subjectId.toString() === idTag
		)
		if (!entry) {
			setConfirmingRemovePerm(null)
			return
		}

		try {
			// deleteShare removes the share_entry AND emits the FSHR DEL notification.
			await api.files.deleteShare(file.fileId, entry.id)
			setUserShareEntries((prev) => prev.filter((e) => e.id !== entry.id))
			toast.success(t('Permission revoked'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to remove permission', err)
			toast.error(t('Failed to revoke permission'))
		} finally {
			setConfirmingRemovePerm(null)
		}
	}

	async function createShareLink() {
		if (!file || !api) return

		setCreatingLink(true)
		setCreateError(null)
		try {
			const ref = await api.refs.create({
				type: 'share.file',
				resourceId: file.fileId,
				accessLevel: newLinkAccess,
				description: newLinkLabel || file.fileName,
				expiresAt: neverExpires ? undefined : dateInputToExpiryIso(newLinkExpires),
				count: null
			})
			setShareRefs((refs) => [...refs, ref])
			toast.success(t('Share link created'))
			setNewLinkLabel('')
			setNewLinkExpires('')
			setNeverExpires(true)
			setCreateLinkOpen(false)
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to create share link', err)
			const code =
				(err as { apiErrorCode?: string; code?: string })?.apiErrorCode ??
				(err as { code?: string })?.code
			const message =
				code === 'E-FILE-ACCESS_LEVEL_FORBIDDEN'
					? t('This access level is not allowed for this file type')
					: t('Failed to create share link')
			setCreateError(message)
			toast.error(message)
		} finally {
			setCreatingLink(false)
		}
	}

	function requestDeleteShareLink(refId: string) {
		setConfirmingDeleteRef(refId)
	}

	function cancelDeleteShareLink() {
		setConfirmingDeleteRef(null)
	}

	async function confirmDeleteShareLink(refId: string) {
		if (!api) return

		try {
			await api.refs.delete(refId)
			setShareRefs((refs) => refs.filter((r) => r.refId !== refId))
			if (editingRefId === refId) cancelEditLink()
			toast.success(t('Share link deleted'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to delete share link', err)
			toast.error(t('Failed to delete share link'))
		} finally {
			setConfirmingDeleteRef(null)
		}
	}

	function copyShareLink(refId: string) {
		const url = `${shareOrigin}/s/${refId}`
		navigator.clipboard.writeText(url)
		toast.success(t('Link copied to clipboard'))
	}

	async function changeLinkAccess(ref: Types.Ref, newLevel: LinkLevel) {
		if (!api) return
		if (ref.accessLevel === newLevel) return
		try {
			const updated = await api.refs.update(ref.refId, { accessLevel: newLevel })
			setShareRefs((refs) => refs.map((r) => (r.refId === ref.refId ? updated : r)))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to update link access', err)
			toast.error(t('Failed to update link access'))
		}
	}

	function refExpiresAtIso(ref: Types.Ref): string | null {
		const d = parseRefDate(ref.expiresAt)
		return d ? d.toISOString() : null
	}

	function beginEditLink(ref: Types.Ref) {
		const exp = refExpiresAtIso(ref)
		setEditDraft({
			description: ref.description ?? '',
			expiresAt: formatRefDate(ref.expiresAt) ?? '',
			neverExpires: exp == null
		})
		setEditingRefId(ref.refId)
	}

	function cancelEditLink() {
		setEditingRefId(null)
		setEditDraft({ description: '', expiresAt: '', neverExpires: true })
	}

	async function saveLinkEdits(ref: Types.Ref) {
		if (!api) return
		const patch: Types.UpdateRefRequest = {}

		const draftDescription = editDraft.description
		if (draftDescription !== (ref.description ?? '')) patch.description = draftDescription

		if (!editDraft.neverExpires && editDraft.expiresAt === '') {
			toast.error(t('Pick an expiry date, or check Never'))
			return
		}
		const draftExpires: string | null = editDraft.neverExpires
			? null
			: (dateInputToExpiryIso(editDraft.expiresAt) ?? null)
		const currentExp = refExpiresAtIso(ref)
		if (draftExpires !== currentExp) patch.expiresAt = draftExpires

		if (Object.keys(patch).length === 0) {
			setEditingRefId(null)
			setEditDraft({ description: '', expiresAt: '', neverExpires: true })
			return
		}

		try {
			const updated = await api.refs.update(ref.refId, patch)
			setShareRefs((refs) => refs.map((r) => (r.refId === ref.refId ? updated : r)))
			toast.success(t('Link updated'))
			setEditingRefId(null)
			setEditDraft({ description: '', expiresAt: '', neverExpires: true })
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to update link', err)
			toast.error(t('Failed to update link'))
		}
	}

	function requestDeleteEntry(entryId: number) {
		setConfirmingDeleteEntry(entryId)
	}

	function cancelDeleteEntry() {
		setConfirmingDeleteEntry(null)
	}

	async function confirmDeleteEntry(entryId: number) {
		if (!api) return

		try {
			await api.files.deleteShare(file.fileId, entryId)
			setFileShareEntries((entries) => entries.filter((e) => e.id !== entryId))
			toast.success(t('Link removed'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to delete share entry', err)
			toast.error(t('Failed to remove link'))
		} finally {
			setConfirmingDeleteEntry(null)
		}
	}

	function handleClose() {
		onClose()
	}

	function handleBackdropClick(e: React.MouseEvent) {
		if (e.target === dialogRef.current) {
			handleClose()
		}
	}

	React.useEffect(
		function closeOnEscape() {
			if (!open) return
			function onKey(e: KeyboardEvent) {
				if (e.key === 'Escape') onClose()
			}
			document.addEventListener('keydown', onKey)
			return () => document.removeEventListener('keydown', onKey)
		},
		[open, onClose]
	)

	const ownerIdTag = file.owner?.idTag ?? auth?.idTag

	React.useEffect(
		function loadOwnerProfile() {
			if (!open || !ownerIdTag) return
			// file.owner is a structural subset of Profile (idTag, name?, profilePic?).
			if (file.owner) {
				setOwnerProfile({
					idTag: file.owner.idTag,
					name: file.owner.name,
					profilePic: file.owner.profilePic
				})
				return
			}
			if (ownerIdTag === auth?.idTag) {
				setOwnerProfile({
					idTag: auth.idTag,
					name: auth.name,
					profilePic: auth.profilePic
				})
				return
			}
			if (!api) return
			let cancelled = false
			getCachedProfile(api, ownerIdTag).then((p) => {
				if (!cancelled) setOwnerProfile(p)
			})
			return () => {
				cancelled = true
			}
		},
		[open, ownerIdTag, file.owner, auth, api]
	)

	if (!open) return null

	return (
		<div ref={dialogRef} className="c-modal show" tabIndex={-1} onClick={handleBackdropClick}>
			<div className="c-dialog c-panel emph p-0 c-share-dialog">
				{/* Header */}
				<div className="c-hbox g-2 p-3 border-bottom">
					<div className="c-hbox g-2 flex-fill align-items-center">
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon, {
							style: { fontSize: '1.25rem' }
						})}
						<div>
							<h3 className="m-0">{t('Share')}</h3>
							<div className="text-secondary text-small text-truncate c-share-dialog__filename">
								{file.fileName}
							</div>
						</div>
					</div>
					<button
						type="button"
						className="c-link p-1"
						onClick={handleClose}
						aria-label={t('Close')}
					>
						<IcClose style={{ fontSize: '1.25rem' }} />
					</button>
				</div>

				{/* Body */}
				<div
					className="p-3"
					style={{ minHeight: '300px', maxHeight: '70vh', overflowY: 'auto' }}
				>
					{!isOwner ? (
						<div className="text-secondary text-center py-4">
							{t('Only the owner can share this file.')}
						</div>
					) : (
						<div className="c-vbox g-4">
							{/* People with access */}
							<div className="c-vbox g-1">
								<h4 className="mb-2 text-secondary text-uppercase text-small">
									{t('People with access')}
								</h4>

								<ProfileMultiSelect
									variant="list"
									placeholder={t('Add people…')}
									listProfiles={listProfiles}
									value={allPeopleProfiles}
									onAdd={(p) => addPerm(p, defaultAddLevel)}
									onRemove={(p) => confirmRemovePerm(p.idTag)}
									searchAddon={
										<AccessLevelMenu<PermLevel>
											value={defaultAddLevel}
											onChange={setDefaultAddLevel}
											disabledLevels={disabledLevels}
											ariaLabel={t('Default access for new people')}
										/>
									}
									renderActions={(p) => (
										<AccessLevelMenu<PermLevel>
											value={levelFor(p.idTag)}
											onChange={(lvl) => changePerm(p.idTag, lvl)}
											onRemove={() => requestRemovePerm(p.idTag)}
											disabledLevels={disabledLevels}
											ariaLabel={t('Change access for {{name}}', {
												name: p.name || p.idTag
											})}
										/>
									)}
									confirmingRemove={confirmingRemovePerm}
									onCancelRemove={cancelRemovePerm}
									removePrompt={(p) =>
										t('Remove access for {{name}}?', {
											name: p.name || p.idTag
										})
									}
									emptyText={t('No one else has access yet')}
								>
									{/* Owner row */}
									{ownerIdTag && (
										<div className="c-hbox g-2 align-items-center p-2">
											<div className="c-hbox g-2 flex-fill align-items-center text-truncate">
												<ProfileCard
													profile={
														ownerProfile ?? {
															idTag: ownerIdTag,
															name: ownerIdTag
														}
													}
												/>
												{ownerIdTag === auth?.idTag && (
													<span className="text-secondary">
														({t('you')})
													</span>
												)}
											</div>
											<span className="c-badge">{t('Owner')}</span>
										</div>
									)}
								</ProfileMultiSelect>
							</div>

							{/* Anyone with the link */}
							<div className="c-vbox g-1">
								<h4 className="mb-2 text-secondary text-uppercase text-small">
									{t('Anyone with the link')}
								</h4>

								{shareRefs.map((ref) => {
									if (confirmingDeleteRef === ref.refId) {
										return (
											<div
												key={ref.refId}
												className="c-hbox g-2 align-items-center p-2"
											>
												<span className="flex-fill text-small">
													{t('Delete this link?')}
												</span>
												<Button
													size="small"
													onClick={cancelDeleteShareLink}
												>
													{t('Cancel')}
												</Button>
												<Button
													size="small"
													variant="primary"
													onClick={() =>
														confirmDeleteShareLink(ref.refId)
													}
												>
													{t('Delete')}
												</Button>
											</div>
										)
									}
									const isEditing = editingRefId === ref.refId
									const formattedExpiry = formatRefDate(ref.expiresAt)
									const expiryText = formattedExpiry
										? `${t('Expires')} ${formattedExpiry}`
										: t('Never expires')
									return (
										<div key={ref.refId} className="c-vbox g-1">
											<div className="c-hbox g-2 align-items-center p-2">
												<IcLink className="flex-shrink-0" />
												<div className="flex-fill text-truncate">
													<div>{ref.description || ref.refId}</div>
													<div className="text-secondary text-small">
														{expiryText}
													</div>
												</div>
												<AccessLevelMenu<LinkLevel>
													value={ref.accessLevel ?? 'read'}
													onChange={(lvl) => changeLinkAccess(ref, lvl)}
													disabledLevels={disabledLevels}
													ariaLabel={t('Change access for link')}
												/>
												<button
													type="button"
													className="c-link p-1"
													title={t('Copy link')}
													onClick={() => copyShareLink(ref.refId)}
												>
													<IcCopy />
												</button>
												<button
													type="button"
													className="c-link p-1"
													title={t('Show QR code')}
													onClick={() =>
														setQrCodeUrl(
															`${shareOrigin}/s/${ref.refId}`
														)
													}
												>
													<IcQrCode />
												</button>
												<Popper
													menuClassName="c-button link p-1"
													icon={<IcMore />}
													aria-label={t('More actions')}
												>
													<ul className="c-nav vertical emph">
														<li>
															<Button
																kind="nav-item"
																onClick={() =>
																	isEditing
																		? cancelEditLink()
																		: beginEditLink(ref)
																}
															>
																<IcPencil />
																{t('Edit link details')}
															</Button>
														</li>
														<li>
															<Button
																kind="nav-item"
																onClick={() =>
																	requestDeleteShareLink(
																		ref.refId
																	)
																}
															>
																<IcTrash
																	style={{
																		color: 'var(--col-error)'
																	}}
																/>
																{t('Delete link')}
															</Button>
														</li>
													</ul>
												</Popper>
											</div>
											{isEditing && (
												<div
													className="c-panel mid p-3 mb-2"
													onKeyDown={(e) => {
														if (e.key === 'Escape') {
															e.stopPropagation()
															e.preventDefault()
															cancelEditLink()
														}
													}}
												>
													<div className="c-vbox g-2">
														<div className="c-hbox g-2 align-items-center">
															<label
																htmlFor={`link-desc-${ref.refId}`}
																className="text-nowrap"
																style={{ minWidth: '80px' }}
															>
																{t('Label')}
															</label>
															<input
																id={`link-desc-${ref.refId}`}
																type="text"
																className="c-input flex-fill"
																value={editDraft.description}
																onChange={(e) =>
																	setEditDraft((d) => ({
																		...d,
																		description: e.target.value
																	}))
																}
															/>
														</div>
														<div className="c-hbox g-2 align-items-center">
															<label
																htmlFor={`link-expires-${ref.refId}`}
																className="text-nowrap"
																style={{ minWidth: '80px' }}
															>
																{t('Expires')}
															</label>
															<div className="c-hbox g-2 flex-fill align-items-center">
																<input
																	id={`link-expires-${ref.refId}`}
																	type="date"
																	className="c-input flex-fill"
																	value={editDraft.expiresAt}
																	onChange={(e) =>
																		setEditDraft((d) => ({
																			...d,
																			expiresAt:
																				e.target.value,
																			neverExpires: e.target
																				.value
																				? false
																				: d.neverExpires
																		}))
																	}
																	disabled={
																		editDraft.neverExpires
																	}
																	min={dayjs().format(
																		'YYYY-MM-DD'
																	)}
																/>
																<Toggle
																	label={t('Never')}
																	checked={editDraft.neverExpires}
																	onChange={(e) =>
																		setEditDraft((d) => ({
																			...d,
																			neverExpires:
																				e.target.checked,
																			expiresAt: e.target
																				.checked
																				? ''
																				: d.expiresAt
																		}))
																	}
																/>
															</div>
														</div>
														<div className="c-hbox g-2 justify-content-end mt-2">
															<Button onClick={cancelEditLink}>
																{t('Cancel')}
															</Button>
															<Button
																variant="primary"
																onClick={() => saveLinkEdits(ref)}
															>
																{t('Save')}
															</Button>
														</div>
													</div>
												</div>
											)}
										</div>
									)
								})}

								{shareRefs.length === 0 && !loadingRefs && (
									<div className="text-secondary text-small px-2">
										{t('No share links yet')}
									</div>
								)}

								{/* Create link disclosure */}
								<details
									className="mt-2"
									open={createLinkOpen}
									onToggle={(e) =>
										setCreateLinkOpen(
											(e.currentTarget as HTMLDetailsElement).open
										)
									}
								>
									<summary className="c-link p-2 c-hbox g-2 align-items-center">
										<IcPlus />
										<span>{t('Create share link')}</span>
									</summary>
									<div className="c-panel mid p-3 mt-2">
										<div className="c-vbox g-2">
											{/* Access level */}
											<div className="c-hbox g-2 align-items-center">
												<label
													className="text-nowrap"
													style={{ minWidth: '80px' }}
												>
													{t('Access')}
												</label>
												<select
													className="c-input flex-fill"
													value={newLinkAccess}
													onChange={(e) =>
														setNewLinkAccess(
															e.target.value as LinkLevel
														)
													}
												>
													<option value="read">{t('Viewer')}</option>
													<option value="comment">
														{t('Commenter')}
													</option>
													{!isImmutable && (
														<option value="write">{t('Editor')}</option>
													)}
												</select>
											</div>

											{/* Label */}
											<div className="c-hbox g-2 align-items-center">
												<label
													className="text-nowrap"
													style={{ minWidth: '80px' }}
												>
													{t('Label')}
												</label>
												<input
													type="text"
													className="c-input flex-fill"
													placeholder={t(
														'e.g. For review, Public access...'
													)}
													value={newLinkLabel}
													onChange={(e) =>
														setNewLinkLabel(e.target.value)
													}
												/>
											</div>

											{/* Expiration */}
											<div className="c-hbox g-2 align-items-center">
												<label
													className="text-nowrap"
													style={{ minWidth: '80px' }}
												>
													{t('Expires')}
												</label>
												<div className="c-hbox g-2 flex-fill align-items-center">
													<input
														type="date"
														className="c-input flex-fill"
														value={newLinkExpires}
														onChange={(e) => {
															setNewLinkExpires(e.target.value)
															if (e.target.value)
																setNeverExpires(false)
														}}
														disabled={neverExpires}
														min={dayjs().format('YYYY-MM-DD')}
													/>
													<Toggle
														label={t('Never')}
														checked={neverExpires}
														onChange={(e) => {
															setNeverExpires(e.target.checked)
															if (e.target.checked)
																setNewLinkExpires('')
														}}
													/>
												</div>
											</div>

											{createError && (
												<div className="text-danger mt-1" role="alert">
													{createError}
												</div>
											)}

											<div className="mt-2">
												<Button
													variant="primary"
													onClick={createShareLink}
													disabled={creatingLink}
												>
													{creatingLink
														? t('Creating...')
														: t('Create Link')}
												</Button>
											</div>
										</div>
									</div>
								</details>
							</div>

							{/* Embedded in (collapsible footer) */}
							{fileShareEntries.length > 0 && (
								<details className="mt-2">
									<summary className="c-link p-2 c-hbox g-2 align-items-center text-secondary">
										<IcDisclosure />
										<span>
											{t('Used in {{count}} documents', {
												count: fileShareEntries.length
											})}
										</span>
									</summary>
									<div className="c-vbox g-2 mt-2">
										{fileShareEntries.map((entry) => {
											const EntryIcon = entry.subjectContentType
												? getFileIcon(
														entry.subjectContentType,
														entry.subjectFileTp
													)
												: IcUnknown

											if (confirmingDeleteEntry === entry.id) {
												return (
													<div
														key={entry.id}
														className="c-hbox g-2 align-items-center p-2"
													>
														<span className="flex-fill text-small">
															{t('Remove this link?')}
														</span>
														<Button
															size="small"
															onClick={cancelDeleteEntry}
														>
															{t('Cancel')}
														</Button>
														<Button
															size="small"
															variant="primary"
															onClick={() =>
																confirmDeleteEntry(entry.id)
															}
														>
															{t('Remove')}
														</Button>
													</div>
												)
											}
											return (
												<div
													key={entry.id}
													className="c-hbox g-2 align-items-center p-2"
												>
													{React.createElement<
														React.ComponentProps<typeof IcUnknown>
													>(EntryIcon, {
														className: 'flex-shrink-0'
													})}
													<div className="flex-fill text-truncate">
														<div>
															{entry.subjectFileName ||
																entry.subjectId}
														</div>
														<div className="text-secondary text-small">
															{entry.permission === 'W'
																? t('Editor')
																: t('Viewer')}
															{(() => {
																const f = formatRefDate(
																	entry.expiresAt
																)
																return f
																	? ` · ${t('Expires')} ${f}`
																	: ''
															})()}
														</div>
													</div>
													<button
														type="button"
														className="c-link p-1"
														title={t('Remove link')}
														onClick={() => requestDeleteEntry(entry.id)}
													>
														<IcTrash />
													</button>
												</div>
											)
										})}
										{loadingEntries && (
											<div className="text-secondary text-small px-2">
												{t('Loading...')}
											</div>
										)}
									</div>
								</details>
							)}
						</div>
					)}
				</div>
			</div>

			<QRCodeDialog value={qrCodeUrl} onClose={() => setQrCodeUrl(undefined)} />
		</div>
	)
}

// vim: ts=4
