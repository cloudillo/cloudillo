// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	Button,
	LoadingSpinner,
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

import { useShareOrigin } from '../../../utils/appOrigin.js'
import { dateInputToExpiryIso, formatRefDate, parseRefDate } from '../../../utils/parseRefDate.js'
import { getCachedProfile, getCachedProfiles } from '../../../utils/profileCache.js'
import { canUseRefCredential, refLifecycle, shareLinkErrorMessage } from '../../../utils/refs.js'
import { isMissingError, isPermissionError } from '../../../utils.js'
import { type FileOwnerScopeOverride, useFileOwnerScope } from '../hooks/useFileOwnerScope.js'
import { getFileIcon, IcUnknown } from '../icons.js'
import type { File } from '../types.js'
import {
	type FileAccessLevel,
	hasAdminGrant,
	isAdminPerm,
	levelsAboveCeiling,
	levelToPermChar,
	linkAccessToPermLevel,
	linkGrantCeiling,
	permCharToLevel,
	type SharePermChar,
	type SharePermLevel,
	sharePermLabel,
	toSharePermChar
} from '../utils.js'
import { AccessLevelMenu } from './AccessLevelMenu.js'

type PermLevel = SharePermLevel
/** A share link's level. Never 'admin' — the backend rejects it on refs. */
type LinkLevel = 'read' | 'comment' | 'write'

export interface ShareDialogProps {
	open: boolean
	file: File
	onClose: () => void
	onPermissionsChanged?: () => void
	// Set while remote-browsing: the node that holds the file, plus the tenant it belongs to and
	// our roles there. Must be the same value DetailsPanel got, or the affordance it offered and
	// what this dialog allows can disagree.
	ownerScope?: FileOwnerScopeOverride
}

export function ShareDialog({
	open,
	file,
	onClose,
	onPermissionsChanged,
	ownerScope
}: ShareDialogProps) {
	const { t } = useTranslation()
	// The owner's node when the file belongs to another tenant, the active context's otherwise.
	// Every listShares/setPermission below goes to whichever node holds the file, and the standing
	// that gates them is judged on that same node. DetailsPanel opens this dialog from the same
	// hook, so the affordance it shows and what the dialog allows cannot disagree.
	const {
		api,
		canManageShares: scopeCanManageShares,
		isCrossOwner,
		resolving,
		scopedFile,
		scopeIdTag,
		scopeRoles
	} = useFileOwnerScope(file, ownerScope)
	const [auth] = useAuth()
	const toast = useToast()
	/*
	 * Whether the server actually served the share listing. The dialog is opened by an explicit user
	 * action on ONE file, so a probing request is affordable here — and it is the only way an
	 * explicit `'A'` grant, which no predicate in utils.ts can see, becomes visible. The predicate
	 * stays the gate on PASSIVE per-selection fetches (see DetailsPanel).
	 */
	const [shareAccess, setShareAccess] = React.useState<
		'loading' | 'granted' | 'denied' | 'error'
	>('loading')
	/* The same three-way verdict for the LINK listing, which `refs.list` answers separately: a 403
	 * there is not the same event as a 403 on `listShares`, and reporting it as an empty list reads
	 * "No share links yet" for a file that may be covered in them. */
	const [refsAccess, setRefsAccess] = React.useState<'loading' | 'granted' | 'denied' | 'error'>(
		'loading'
	)
	/*
	 * The serving node's own `accessLevel` for this file, fetched only when the row is cross-owner —
	 * where `deriveFileOwnerScope` has stripped the active context's answer. It is the only thing
	 * that sees an `'A'` grant INHERITED from a parent folder, which `hasAdminGrant` (own entries
	 * only) cannot. A refinement, never a gate: failures are swallowed.
	 */
	const [authoritativeLevel, setAuthoritativeLevel] = React.useState<
		FileAccessLevel | undefined
	>()

	/*
	 * Share URLs must point at the tenant that holds the ref — its app/web domain, not the API host.
	 * `scopeIdTag` IS that tenant: the owner when cross-owner, the browsed node with an override, the
	 * active context otherwise.
	 *
	 * Deliberately scopeIdTag alone, not `file.owner?.idTag ?? scopeIdTag`: `api` is the client for
	 * `scopeIdTag`, and useShareOrigin caches the app domain BY the idTag it is handed — see the
	 * cache invariant in appOrigin.ts.
	 */
	const shareOrigin = useShareOrigin(api, scopeIdTag, auth?.idTag)

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

	// The predicate is the optimistic answer; what the server told us is the authoritative one. An
	// explicit 'A' grant confers share management server-side and is only visible from here — from
	// the metadata probe when inherited, from the entries when granted on this file directly.
	const canShare =
		scopeCanManageShares ||
		authoritativeLevel === 'admin' ||
		hasAdminGrant(userShareEntries, auth?.idTag)

	const Icon = getFileIcon(file.contentType, file.fileTp)
	// Backend convention: missing fileTp defaults to BLOB (immutable)
	const isImmutable = file.fileTp === 'BLOB' || file.fileTp == null
	/*
	 * The backend caps every mint and widen at the caller's own access (`ensure_grant_within`), so a
	 * Read-level creator of a tenant-owned file may manage its shares but hand out nothing above
	 * 'read'. Offering the level anyway produces a menu entry that 403s.
	 */
	const ceiling = linkGrantCeiling(
		authoritativeLevel ? { ...scopedFile, accessLevel: authoritativeLevel } : scopedFile,
		auth?.idTag,
		scopeIdTag,
		scopeRoles
	)
	const disabledLevels: PermLevel[] = React.useMemo(
		() =>
			Array.from(
				new Set<PermLevel>([
					...(isImmutable ? (['WRITE'] as PermLevel[]) : []),
					...levelsAboveCeiling(ceiling)
				])
			),
		[isImmutable, ceiling]
	)

	// Keep the create-link selection inside the menu it is offered from: a ceiling arriving after
	// the dialog opened must not leave 'write' selected in a select that no longer lists it.
	React.useEffect(
		function clampNewLinkAccess() {
			if (disabledLevels.includes(linkAccessToPermLevel(newLinkAccess))) {
				setNewLinkAccess(disabledLevels.includes('COMMENT') ? 'read' : 'comment')
			}
		},
		[disabledLevels, newLinkAccess]
	)

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
			// Deliberately ungated by any predicate: `listShares` is the authority on whether this
			// user may see the listing, and asking it is the only way to discover an explicit 'A'
			// grant. Gating on the client-side predicate hides it from users the backend would serve.
			if (!api || !open) return

			let cancelled = false

			;(async function () {
				setLoadingRefs(true)

				try {
					const refs = await api.refs.list({
						type: 'share.file',
						resourceId: file.fileId,
						// The server default is 'active', which hides expired and fully-used rows.
						// This is the MANAGEMENT surface: a dead link the owner cannot see is one
						// they cannot delete or extend.
						filter: 'all'
					})
					if (!cancelled) {
						setShareRefs(refs)
						setRefsAccess('granted')
					}
				} catch (err) {
					// Same classification as the entries fetch below: a refusal is an answer, a
					// transport failure is not, and neither is an empty list.
					const denied = isPermissionError(err) || isMissingError(err)
					if (!cancelled) setRefsAccess(denied ? 'denied' : 'error')
					console.error('Failed to load share links', err)
				} finally {
					if (!cancelled) setLoadingRefs(false)
				}

				// Cross-owner only: same-owner rows already carry the resolved level from
				// `GET /api/files`, and `deriveFileOwnerScope` keeps it there.
				if (isCrossOwner) {
					try {
						const meta = await api.files.getMetadata(file.fileId)
						if (!cancelled) setAuthoritativeLevel(meta.accessLevel)
					} catch (err) {
						// A refinement, not a gate: without it we simply fall back to the
						// predicate and to hasAdminGrant.
						console.error('Failed to load file metadata', err)
					}
				}

				let userEntries: Types.ShareEntry[] = []
				try {
					if (!cancelled) setLoadingEntries(true)
					const allEntries = await api.files.listShares(file.fileId)
					if (!cancelled) {
						userEntries = allEntries.filter((e) => e.subjectType === 'U')
						setUserShareEntries(userEntries)
						setFileShareEntries(allEntries.filter((e) => e.subjectType === 'F'))
						setShareAccess('granted')
					}
				} catch (err) {
					// A 403 IS the answer, not a failure, and on a READ a 404 is the same answer:
					// several endpoints hide a resource rather than refuse it, and offering
					// "please try again" for a permanent refusal is a lie. Anything else is a
					// transport problem and gets its own state — settled as 'granted' it renders
					// "No one else has access yet", indistinguishable from an unshared file.
					const denied = isPermissionError(err) || isMissingError(err)
					if (!cancelled) setShareAccess(denied ? 'denied' : 'error')
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
		[api, open, file.fileId, isCrossOwner]
	)

	React.useEffect(
		function resetShareStateOnFileChange() {
			// A previous file's verdict must not decide this one's body while its own listing is
			// still in flight — and neither may its ENTRIES: `canShare` folds in
			// hasAdminGrant(userShareEntries, auth?.idTag), so an 'A' grant on the previous file
			// would render the full mutating share UI for one this user cannot manage.
			setShareAccess('loading')
			setRefsAccess('loading')
			setAuthoritativeLevel(undefined)
			setUserShareEntries([])
			setFileShareEntries([])
			setShareRefs([])
			setPeopleProfiles({})
		},
		[file.fileId]
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
				permission: levelToPermChar(perm)
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
		// Admin grants are rendered read-only; never let one be rewritten to
		// 'W' by a level toggle — the UI could not grant it back.
		if (isAdminPerm(entry.permission)) return
		const newPerm = levelToPermChar(newLevel)
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

	function permCharFor(idTag: string): SharePermChar {
		const entry = userShareEntries.find(
			(e) => e.subjectType === 'U' && e.subjectId.toString() === idTag
		)
		return toSharePermChar(entry?.permission)
	}

	function levelFor(idTag: string): PermLevel {
		return permCharToLevel(permCharFor(idTag))
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
			const message = shareLinkErrorMessage(err, t)
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
		const url = `${shareOrigin.href}/s/${refId}`
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
			// Widening a link is capped by the same grant ceiling creating one is, so the refusal
			// deserves the same explanation rather than a flat "Failed to update".
			toast.error(shareLinkErrorMessage(err, t))
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
			toast.error(shareLinkErrorMessage(err, t))
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

	// Same substitution useFileOwnerScope makes for the predicates: an ownerless row belongs to the
	// tenant that served it, not to whoever is looking at it.
	const ownerIdTag = file.owner?.idTag ?? scopeIdTag ?? auth?.idTag

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

	// Shared by the editable and the read-only people list below, so the two cannot drift
	const ownerRow = ownerIdTag ? (
		<div className="c-hbox g-2 align-items-center p-2">
			<div className="c-hbox g-2 flex-fill align-items-center text-truncate">
				<ProfileCard profile={ownerProfile ?? { idTag: ownerIdTag, name: ownerIdTag }} />
				{ownerIdTag === auth?.idTag && <span className="text-secondary">({t('you')})</span>}
			</div>
			<span className="c-badge">{t('Owner')}</span>
		</div>
	) : null

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
					{/*
						Four states, and they must not be conflated. `resolving`: a token is still
						in flight, so a refusal here would be a lie. `!api` once settled: the
						owner's node could not be reached at all. Then the listing itself, whose
						verdict is the SERVER's: still in flight, or refused.
					*/}
					{resolving ? (
						<div className="c-vbox align-items-center justify-content-center py-4">
							<LoadingSpinner />
						</div>
					) : !api ? (
						/* Must precede the listing states: with no client the effect never runs,
						   so `shareAccess` would sit at 'loading' and spin forever. */
						<div className="text-secondary text-center py-4">
							{t(
								'Could not reach the server that holds this file. Please try again.'
							)}
						</div>
					) : shareAccess === 'loading' ? (
						<div className="c-vbox align-items-center justify-content-center py-4">
							<LoadingSpinner />
						</div>
					) : shareAccess === 'denied' ? (
						<div className="text-secondary text-center py-4">
							{t('You do not have permission to see who this file is shared with.')}
						</div>
					) : shareAccess === 'error' ? (
						/* A transport failure is not an empty file: reported as one it reads "No one
						   else has access yet" for a file that may be shared with anyone. */
						<div className="text-secondary text-center py-4">
							{t('Could not load who this file is shared with. Please try again.')}
						</div>
					) : (
						<div className="c-vbox g-4">
							{/* Reader standing: the list is served, the mutating controls are not */}
							{!canShare && (
								<div className="text-secondary text-small">
									{t(
										'You can see who this is shared with, but only the owner can change it.'
									)}
								</div>
							)}

							{/* People with access */}
							<div className="c-vbox g-1">
								<h4 className="mb-2 text-secondary text-uppercase text-small">
									{t('People with access')}
								</h4>

								{!canShare ? (
									<>
										{ownerRow}
										{allPeopleProfiles.map((profile) => (
											<div
												key={profile.idTag}
												className="c-hbox g-2 align-items-center p-2"
											>
												<div className="flex-fill text-truncate">
													<ProfileCard profile={profile} />
												</div>
												<span
													className={
														isAdminPerm(permCharFor(profile.idTag))
															? 'c-badge warning'
															: 'c-badge'
													}
												>
													{sharePermLabel(permCharFor(profile.idTag), t)}
												</span>
											</div>
										))}
										{allPeopleProfiles.length === 0 && (
											<span className="text-muted text-small">
												{t('No one else has access yet')}
											</span>
										)}
									</>
								) : (
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
										renderActions={(p) =>
											// An 'A' grant is a standing this picker cannot
											// express; show it as-is rather than offering
											// edits that would silently downgrade it. Its own
											// 'warning' colour, matching DetailsPanel's
											// PermChip - on 'accent' it read as an editor grant.
											isAdminPerm(permCharFor(p.idTag)) ? (
												<span className="c-badge warning">
													{t('Admin')}
												</span>
											) : (
												<AccessLevelMenu<PermLevel>
													value={levelFor(p.idTag)}
													onChange={(lvl) => changePerm(p.idTag, lvl)}
													onRemove={() => requestRemovePerm(p.idTag)}
													disabledLevels={disabledLevels}
													ariaLabel={t('Change access for {{name}}', {
														name: p.name || p.idTag
													})}
												/>
											)
										}
										confirmingRemove={confirmingRemovePerm}
										onCancelRemove={cancelRemovePerm}
										removePrompt={(p) =>
											t('Remove access for {{name}}?', {
												name: p.name || p.idTag
											})
										}
										emptyText={t('No one else has access yet')}
									>
										{ownerRow}
									</ProfileMultiSelect>
								)}
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
									const lifecycle = refLifecycle(ref, new Date())
									const isDead = lifecycle !== 'active'
									const formattedExpiry = formatRefDate(ref.expiresAt)
									const expiryText = formattedExpiry
										? `${lifecycle === 'expired' ? t('Expired') : t('Expires')} ${formattedExpiry}`
										: t('Never expires')
									// The refId is the credential; the label must never leak it, and a
									// `redacted` refId is an opaque digest (r1~…) that is not even a
									// working one. Copy is the way to obtain the value.
									const usable = canUseRefCredential(ref, canShare)
									return (
										<div key={ref.refId} className="c-vbox g-1">
											<div className="c-hbox g-2 align-items-center p-2">
												<IcLink className="flex-shrink-0" />
												<div className="flex-fill text-truncate">
													<div>{ref.description || t('Share link')}</div>
													<div className="text-secondary text-small">
														{expiryText}
													</div>
												</div>
												{lifecycle === 'expired' && (
													<span className="c-badge warning">
														{t('Expired')}
													</span>
												)}
												{lifecycle === 'used' && (
													<span className="c-badge warning">
														{t('Used')}
													</span>
												)}
												{/* `refs.update` addresses the ref by its refId too, so a
												    redacted row falls back to the read-only badge. A dead
												    link's level cannot be changed either: the backend
												    refuses to resurrect a fully-used ref, and widening an
												    expired one grants nothing. */}
												{usable && !isDead ? (
													<AccessLevelMenu<LinkLevel>
														value={ref.accessLevel ?? 'read'}
														onChange={(lvl) =>
															changeLinkAccess(ref, lvl)
														}
														disabledLevels={disabledLevels}
														ariaLabel={t('Change access for link')}
													/>
												) : (
													<span className="c-badge">
														{sharePermLabel(
															levelToPermChar(
																linkAccessToPermLevel(
																	ref.accessLevel
																)
															),
															t
														)}
													</span>
												)}
												{/* Copy and QR need canManageShares, not canReadShares:
												    the refId IS the credential, so handing it out is
												    itself an act of re-sharing. A reader may see that a
												    link exists and at what level, never its value.
												    `redacted` is the SERVER saying it withheld the
												    credential, which outranks the local predicate:
												    the digest builds no working URL and no valid QR.
												    `shareOrigin.trusted` is the third gate: until the
												    tenant's real app domain lands, the only origin we
												    have is our own, and /s/:refId resolves against the
												    origin's tenant — that URL would 404 for the
												    recipient. A dead link's URL is dead too. */}
												{usable && !isDead && (
													<>
														<button
															type="button"
															className="c-link p-1"
															title={
																shareOrigin.trusted
																	? t('Copy link')
																	: t(
																			'Resolving the share address for this file…'
																		)
															}
															disabled={!shareOrigin.trusted}
															onClick={() => copyShareLink(ref.refId)}
														>
															<IcCopy />
														</button>
														<button
															type="button"
															className="c-link p-1"
															title={
																shareOrigin.trusted
																	? t('Show QR code')
																	: t(
																			'Resolving the share address for this file…'
																		)
															}
															disabled={!shareOrigin.trusted}
															onClick={() =>
																setQrCodeUrl(
																	`${shareOrigin.href}/s/${ref.refId}`
																)
															}
														>
															<IcQrCode />
														</button>
													</>
												)}
												{/* Edit/delete address the ref BY its refId, which a
												    redacted digest is not: both calls would 404. They
												    need no origin, and they stay on DEAD rows too —
												    deleting one, or pushing its expiry forward, is the
												    only thing left to do with it. */}
												{usable && (
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
												)}
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

								{/* An empty list is only one of three reasons nothing is here, and the
								    other two are not "no share links yet". */}
								{shareRefs.length === 0 && !loadingRefs && (
									<div className="text-secondary text-small px-2">
										{refsAccess === 'denied'
											? t(
													"You do not have permission to see this file's share links."
												)
											: refsAccess === 'error'
												? t(
														"Could not load this file's share links. Please try again."
													)
												: t('No share links yet')}
									</div>
								)}

								{/* Create link disclosure */}
								{canShare && (
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
														{/* Same `disabledLevels` the per-row menus get:
														    an immutable file has no editor level, and
														    the grant ceiling caps what we may mint at
														    what we hold. */}
														<option value="read">{t('Viewer')}</option>
														{!disabledLevels.includes('COMMENT') && (
															<option value="comment">
																{t('Commenter')}
															</option>
														)}
														{!disabledLevels.includes('WRITE') && (
															<option value="write">
																{t('Editor')}
															</option>
														)}
													</select>
												</div>

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
								)}
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
															{sharePermLabel(
																toSharePermChar(entry.permission),
																t
															)}
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
													{canShare && (
														<button
															type="button"
															className="c-link p-1"
															title={t('Remove link')}
															onClick={() =>
																requestDeleteEntry(entry.id)
															}
														>
															<IcTrash />
														</button>
													)}
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
