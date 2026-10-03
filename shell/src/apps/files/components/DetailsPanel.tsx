// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import { getFileUrl } from '@cloudillo/core'
import {
	Badge,
	Breadcrumbs,
	Button,
	DescriptionList,
	type DescriptionListItem,
	Disclosure,
	EmptyState,
	FileTypeIcon,
	HBox,
	Heading,
	IconText,
	List,
	ListItem,
	Menu,
	MenuItem,
	Panel,
	ProfileCard,
	QRCodeDialog,
	RoomChip,
	Text,
	Thumbnail,
	useAuth,
	useToast,
	VBox
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FiMoreVertical as IcMore } from 'react-icons/fi'
import {
	LuChevronDown as IcChevronDown,
	LuCopy as IcCopy,
	LuPencil as IcEdit,
	LuLink as IcLink,
	LuPin as IcPin,
	LuQrCode as IcQrCode,
	LuShare2 as IcShare,
	LuStar as IcStar,
	LuEye as IcView
} from 'react-icons/lu'

import { useCurrentContextIdTag } from '../../../context/index.js'
import { useShareOrigin } from '../../../utils/appOrigin.js'
import { formatRefDate } from '../../../utils/parseRefDate.js'
import { getCachedProfile, getCachedProfiles } from '../../../utils/profileCache.js'
import { canUseRefCredential } from '../../../utils/refs.js'
import { isMissingError, isPermissionError } from '../../../utils.js'
import { type FileOwnerScopeOverride, useFileOwnerScope } from '../hooks/useFileOwnerScope.js'
import type { File, FileOps } from '../types.js'
import {
	canWrite,
	formatRelativeTime,
	getVisibilityDropdownOptions,
	getVisibilityIcon,
	getVisibilityLabel,
	levelToPermChar,
	linkAccessToPermLevel,
	type SharePermLevel,
	sharePermLabel,
	sharePermVariant,
	toAppAccess,
	toSharePermChar
} from '../utils.js'
import { TagsCell } from './TagsCell.js'

type PermLevel = SharePermLevel

/** Renders a raw `ShareEntry.permission` char, including the read-only 'A'
 *  (admin) standing this UI cannot grant. Label and colour come from the same
 *  pair of helpers ShareDialog uses, so the two surfaces cannot drift. */
function PermChip({ perm }: { perm: string }) {
	const { t } = useTranslation()
	return <Badge color={sharePermVariant(perm)}>{sharePermLabel(perm, t)}</Badge>
}

/** Same chip for a link's level, which never carries admin. */
function AccessChip({ level }: { level: PermLevel }) {
	const perm = levelToPermChar(level)
	const { t } = useTranslation()
	return <Badge color={sharePermVariant(perm)}>{sharePermLabel(perm, t)}</Badge>
}

/** Folders carry no MIME type; FileTypeIcon knows them as `cloudillo/folder`. */
function iconContentType(contentType: string | undefined, fileTp: string | undefined) {
	return fileTp === 'FLDR' ? 'cloudillo/folder' : contentType
}

/** Human label for a content type ("Quillo document", "Folder", "PDF document"), shown
 *  instead of the raw MIME type. Unknown types fall back to the MIME type itself. */
export function contentTypeLabel(
	t: TFunction,
	contentType: string | undefined,
	fileTp?: string
): string | undefined {
	const ct = iconContentType(contentType, fileTp)
	if (!ct) return undefined
	if (ct === 'cloudillo/folder') return t('Folder')
	if (ct.startsWith('cloudillo/')) {
		const app = ct.slice('cloudillo/'.length)
		return t('{{app}} document', { app: app.charAt(0).toUpperCase() + app.slice(1) })
	}
	if (ct === 'application/pdf') return t('PDF document')
	if (ct.startsWith('image/')) return t('Image')
	if (ct.startsWith('video/')) return t('Video')
	if (ct.startsWith('audio/')) return t('Audio')
	if (ct.startsWith('text/')) return t('Text file')
	return ct
}

// Abbreviate deeply nested paths so they stay on one line.
const MAX_INLINE_SEGMENTS = 4

interface PathBreadcrumbProps {
	path: { id: string; name: string }[] | undefined
	parentId: string | null | undefined
	onNavigate?: (folderId: string | null) => void
}

function PathBreadcrumb({ path, parentId, onNavigate }: PathBreadcrumbProps) {
	const { t } = useTranslation()

	// Loading: path lookup still in flight for a non-root file.
	if (path === undefined && parentId) {
		return <Text emphasis="muted">{t('Loading…')}</Text>
	}

	// Empty path on a non-root file means the lookup failed
	// (e.g. parent deleted) — distinguish from the genuine
	// root case where parentId is explicitly null.
	if (path && path.length === 0 && parentId) {
		return <Text emphasis="muted">{t('Unknown')}</Text>
	}

	const items = [
		{ label: t('Files'), onClick: onNavigate ? () => onNavigate(null) : undefined },
		...(path ?? []).map((seg) => ({
			label: seg.name,
			onClick: onNavigate ? () => onNavigate(seg.id) : undefined
		}))
	]

	return <Breadcrumbs items={items} maxItems={MAX_INLINE_SEGMENTS + 1} label={t('Location')} />
}

interface DetailsPanelProps {
	className?: string
	file: File
	fileOps: FileOps
	onShare?: (file: File) => void
	onNavigateToFolder?: (folderId: string | null) => void
	// When the panel describes a file from a remote share, the list-source
	// API (the share owner's server) is the only one that can resolve the
	// file's path. Local API would return empty → "Unknown". Falls back to
	// the context-aware API when not supplied. Carries the browsed tenant and
	// our roles there too — the node and the standing that gates it must agree.
	ownerScope?: FileOwnerScopeOverride
}

export function DetailsPanel({
	file,
	fileOps,
	onShare,
	onNavigateToFolder,
	ownerScope
}: DetailsPanelProps) {
	const { t } = useTranslation()
	const contextIdTag = useCurrentContextIdTag()
	const [auth] = useAuth()

	// Which node holds this file and whose roles decide what we may do with it. Shared with the
	// ShareDialog this panel opens - see useFileOwnerScope for why they must not derive it twice.
	const scope = useFileOwnerScope(file, ownerScope)
	const { api, isCrossOwner, upstreamIdTag } = scope
	// `resolving` is not enough: the owner branch of canManageFile/canManageShares needs no roles,
	// so an own file reads as manageable while `api` is still null. Requiring the client too is what
	// stops the affordance rendering before the node it targets exists.
	const scopeReady = !scope.resolving && !!scope.api
	// Off the scope, i.e. from whichever node `api` points at - never the active context.
	const canManage = scopeReady && scope.canManageFile
	// Sharing is a stricter, separately-gated standing than rename/visibility.
	const canShare = scopeReady && scope.canManageShares
	// Wider than either: the backend lets any writer enumerate a file's shares, so the panel lists
	// who it is shared with even when nothing in it may be changed.
	const canSeeShares = scopeReady && scope.canReadShares
	const toast = useToast()
	// `scopeIdTag` is the tenant that holds the ref AND the one `api` targets, which useShareOrigin
	// requires - see the cache invariant in appOrigin.ts.
	const shareOrigin = useShareOrigin(api, scope.scopeIdTag, auth?.idTag)
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[] | undefined>()
	// Same three-way verdict ShareDialog keeps: a refusal and a transport failure are not an empty
	// list, and rendering either as "No share links yet" describes a file we know nothing about.
	const [refsAccess, setRefsAccess] = React.useState<'loading' | 'granted' | 'denied' | 'error'>(
		'loading'
	)
	const [userShareEntries, setUserShareEntries] = React.useState<Types.ShareEntry[] | undefined>()
	const [fileShareEntries, setFileShareEntries] = React.useState<Types.ShareEntry[] | undefined>()
	const [peopleProfiles, setPeopleProfiles] = React.useState<Record<string, Profile>>({})
	const [ownerProfile, setOwnerProfile] = React.useState<Profile | null>(null)
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()
	const [filePath, setFilePath] = React.useState<{ id: string; name: string }[] | undefined>(
		file.path
	)
	// Intentionally per-panel: cache dies with the details overlay (panel
	// unmounts on navigate/close), so unbounded growth isn't a concern.
	const pathCacheRef = React.useRef<Map<string, { id: string; name: string }[]>>(new Map())

	const isImage = file.contentType?.startsWith('image/')
	const isFolder = file.fileTp === 'FLDR'

	const allPeople = React.useMemo(
		function allPeople() {
			function key(e: Types.ShareEntry) {
				const idTag = e.subjectId.toString()
				return (peopleProfiles[idTag]?.name ?? idTag).toLowerCase()
			}
			return userShareEntries
				? [...userShareEntries].sort((a, b) => key(a).localeCompare(key(b)))
				: undefined
		},
		[userShareEntries, peopleProfiles]
	)

	React.useEffect(
		function resetShareStateOnFileChange() {
			// Deliberately NOT folded into loadFileDetails: that effect early-returns when
			// `!canSeeShares`, which would leave the previous file's links, entries and profiles
			// on screen for exactly the rows that must not show them.
			setShareRefs(undefined)
			setRefsAccess('loading')
			setUserShareEntries(undefined)
			setFileShareEntries(undefined)
			setPeopleProfiles({})
		},
		[file.fileId]
	)

	React.useEffect(
		function loadFileDetails() {
			// Both calls need share-READER standing server-side; without this a read-only viewer
			// 403s twice on every selection for a section that then renders nothing. `canSeeShares`
			// folds in `scopeReady`, so this also keeps the fetch off a half-resolved scope.
			if (!api || !canSeeShares) return

			let cancelled = false

			;(async function () {
				try {
					// Deliberately the server default ('active'): this panel is a compact read-only
					// summary, so a dead link is noise here. ShareDialog is the management surface,
					// and it asks for 'all' so expired and used links stay reachable there.
					const refs = await api.refs.list({
						type: 'share.file',
						resourceId: file.fileId
					})
					if (!cancelled) {
						setShareRefs(refs)
						setRefsAccess('granted')
					}
				} catch (err) {
					const denied = isPermissionError(err) || isMissingError(err)
					if (!cancelled) {
						setRefsAccess(denied ? 'denied' : 'error')
						// `undefined` IS the loading state here; leaving it there spins forever.
						setShareRefs([])
					}
					console.error('Failed to load share links', err)
				}

				let userEntries: Types.ShareEntry[] = []
				try {
					const allEntries = await api.files.listShares(file.fileId)
					if (cancelled) return
					userEntries = allEntries.filter((e) => e.subjectType === 'U')
					setUserShareEntries(userEntries)
					setFileShareEntries(allEntries.filter((e) => e.subjectType === 'F'))
				} catch (err) {
					console.error('Failed to load share entries', err)
				}

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
		[api, canSeeShares, file.fileId]
	)

	// The owner profile to render. The backend back-fills `owner` to the serving tenant, so the
	// fallbacks only cover rows the shell built itself - and `api` below is the scope tenant's
	// client, so `scopeIdTag` is what it can actually look up.
	const ownerIdTag = file.owner?.idTag ?? scope.scopeIdTag ?? contextIdTag

	React.useEffect(
		function loadOwnerProfile() {
			if (!ownerIdTag) return
			if (file.owner) {
				setOwnerProfile({
					idTag: file.owner.idTag,
					name: file.owner.name,
					profilePic: file.owner.profilePic
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
		[ownerIdTag, file.owner, api]
	)

	React.useEffect(
		function loadFilePath() {
			if (!api) return

			// Key by api source so switching between local/remote with the
			// same fileId doesn't return a path from the wrong context.
			const cacheKey = `${ownerScope ? 'remote' : isCrossOwner ? `upstream:${upstreamIdTag}` : 'local'}:${file.fileId}`

			// Use path already on the file if present (from a withPath listing).
			if (file.path) {
				pathCacheRef.current.set(cacheKey, file.path)
				setFilePath(file.path)
				return
			}

			// Hit the per-selection cache before issuing a request.
			const cached = pathCacheRef.current.get(cacheKey)
			if (cached) {
				setFilePath(cached)
				return
			}

			setFilePath(undefined)
			let cancelled = false

			;(async function () {
				try {
					const results = await api.files.list({ fileId: file.fileId, withPath: true })
					if (cancelled) return
					const fetched = results[0]?.path ?? []
					pathCacheRef.current.set(cacheKey, fetched)
					setFilePath(fetched)
				} catch (err) {
					console.error('Failed to load file path', err)
					if (!cancelled) setFilePath([])
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[api, ownerScope, isCrossOwner, upstreamIdTag, file.fileId, file.path]
	)

	function copyShareLink(refId: string) {
		const url = `${shareOrigin.href}/s/${refId}`
		navigator.clipboard.writeText(url)
		toast.success(t('Link copied to clipboard'))
	}

	const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)

	// The host that serves the thumbnail is the one holding the blob - the upstream node for a
	// mirrored row, otherwise whichever tenant the scope points at.
	const thumbIdTag = upstreamIdTag || scope.scopeIdTag || contextIdTag
	const thumbId = isImage ? file.fileId : file.variantId
	const thumbSrc = thumbId && thumbIdTag ? getFileUrl(thumbIdTag, thumbId, 'vis.sd') : undefined

	const sharedPeopleCount = allPeople?.length ?? 0
	const sharedLinkCount = shareRefs?.length ?? 0
	const isSharingLoading = userShareEntries === undefined || shareRefs === undefined
	const noShares =
		sharedPeopleCount === 0 && sharedLinkCount === 0 && (fileShareEntries?.length ?? 0) === 0
	const sharingSummary =
		sharedPeopleCount > 0 || sharedLinkCount > 0
			? [
					sharedPeopleCount > 0
						? sharedPeopleCount === 1
							? t('1 person')
							: t('{{n}} people', { n: sharedPeopleCount })
						: null,
					sharedLinkCount > 0
						? sharedLinkCount === 1
							? t('1 link')
							: t('{{n}} links', { n: sharedLinkCount })
						: null
				]
					.filter(Boolean)
					.join(' · ')
			: undefined

	const credentialUnavailable = t('Resolving the share address for this file…')

	const properties: DescriptionListItem[] = [
		{
			key: 'visibility',
			term: t('Visibility'),
			description:
				canManage && !isCrossOwner && fileOps.setVisibility ? (
					<Menu
						trigger={
							<Button variant="soft" icon={<VisibilityIcon />}>
								{getVisibilityLabel(t, file.visibility ?? null)}
								<IcChevronDown />
							</Button>
						}
					>
						{getVisibilityDropdownOptions(t).map((opt) => {
							const OptionIcon = opt.icon
							return (
								<MenuItem
									key={opt.value ?? 'null'}
									icon={<OptionIcon />}
									label={opt.label}
									checked={(file.visibility ?? null) === opt.value}
									// Cross-owner rows never reach this branch: a Pin/Place row
									// reuses the SOURCE's file_id (cloudillo-rs handler.rs:1707),
									// so which node owns a placed row's mutable state is
									// unresolved. Until it is, they stay read-only.
									onClick={() =>
										fileOps.setVisibility!(
											file.fileId,
											opt.value,
											api ?? undefined
										)
									}
								/>
							)
						})}
					</Menu>
				) : (
					<IconText icon={<VisibilityIcon />}>
						{getVisibilityLabel(t, file.visibility ?? null)}
					</IconText>
				)
		},
		...(file.owner?.name
			? [{ key: 'owner', term: t('Owner'), description: file.owner.name }]
			: []),
		{
			key: 'location',
			term: t('Location'),
			description: (
				<PathBreadcrumb
					path={filePath}
					parentId={file.parentId}
					onNavigate={onNavigateToFolder}
				/>
			)
		},
		...(file.channel
			? [
					{
						key: 'room',
						term: t('Room'),
						description: <RoomChip channel={file.channel} contextTag={ownerIdTag} />
					}
				]
			: []),
		...(file.contentType
			? [
					{
						key: 'type',
						term: t('Type'),
						description: contentTypeLabel(t, file.contentType, file.fileTp)
					}
				]
			: []),
		{ key: 'created', term: t('Created'), description: formatRelativeTime(file.createdAt) },
		...(file.userData?.modifiedAt
			? [
					{
						key: 'modified',
						term: t('Last edited'),
						description: formatRelativeTime(file.userData.modifiedAt)
					}
				]
			: []),
		...(file.userData?.accessedAt
			? [
					{
						key: 'accessed',
						term: t('Last opened'),
						description: formatRelativeTime(file.userData.accessedAt)
					}
				]
			: []),
		{
			key: 'tags',
			term: t('Tags'),
			// Tag writes go to the active context's client, so a cross-owner row is
			// read-only here rather than routed to the owner's node.
			description: (
				<TagsCell
					fileId={file.fileId}
					tags={file.tags}
					editable={canManage && !isCrossOwner}
					setTags={(tags) => fileOps.setFile?.({ ...file, tags })}
				/>
			)
		}
	]

	return (
		<VBox gap={2}>
			{/* Header — subject of the panel — and quick-actions toolbar */}
			<Panel>
				<HBox gap={3} align="center">
					{thumbSrc ? (
						<Thumbnail src={thumbSrc} alt={file.fileName} size="lg" />
					) : (
						<FileTypeIcon
							contentType={iconContentType(file.contentType, file.fileTp)}
							size="lg"
						/>
					)}
					<VBox className="flex-fill w-min-0">
						<Heading level={2} size="lg" className="text-truncate">
							{file.fileName}
						</Heading>
						{(file.contentType || file.owner?.name) && (
							<Text size="sm" emphasis="muted">
								{[
									contentTypeLabel(t, file.contentType, file.fileTp),
									file.owner?.name
								]
									.filter(Boolean)
									.join(' · ')}
							</Text>
						)}
					</VBox>
				</HBox>

				{/* Quick actions toolbar */}
				<HBox gap={1} className="mt-2">
					{!isFolder && (
						<Button
							variant="ghost"
							icon={canWrite(file.accessLevel) ? <IcEdit /> : <IcView />}
							aria-label={t('Open')}
							onClick={() =>
								fileOps.openFile(file.fileId, toAppAccess(file.accessLevel))
							}
						/>
					)}
					<Button
						variant="ghost"
						icon={<IcStar />}
						pressed={!!file.userData?.starred}
						aria-label={file.userData?.starred ? t('Starred') : t('Star')}
						onClick={() => fileOps.toggleStarred?.(file.fileId)}
					/>
					<Button
						variant="ghost"
						icon={<IcPin />}
						pressed={!!file.userData?.pinned}
						aria-label={file.userData?.pinned ? t('Pinned') : t('Pin')}
						onClick={() => fileOps.togglePinned?.(file.fileId)}
					/>
					{/* Same cross-owner exclusion as Visibility below: a placed row's file_id names
					    a row on two nodes, so we do not offer a write we cannot route. */}
					{canManage && !isCrossOwner && (
						<Menu
							trigger={
								<Button
									variant="ghost"
									icon={<IcMore />}
									aria-label={t('More actions')}
									className="ms-auto"
								/>
							}
						>
							<MenuItem
								label={t('Rename...')}
								onClick={() => fileOps.renameFile(file.fileId)}
							/>
						</Menu>
					)}
				</HBox>
			</Panel>

			{/* Properties */}
			<Panel>
				<DescriptionList items={properties} />
			</Panel>

			{canSeeShares && (
				<Panel
					title={t('Sharing')}
					description={sharingSummary}
					headingLevel={3}
					actions={
						// A reader may OPEN the dialog - it renders a complete read-only variant,
						// and that listing is also the only way an explicit 'A' grant, which no
						// predicate here can see, becomes visible. Only the label changes.
						onShare && (
							<Button size="sm" icon={<IcShare />} onClick={() => onShare(file)}>
								{canShare ? t('Manage sharing') : t('View sharing')}
							</Button>
						)
					}
				>
					<VBox gap={3}>
						{/* People with access — Owner row always visible */}
						<VBox gap={1}>
							<Heading level={4} overline>
								{t('People with access')}
							</Heading>
							{ownerIdTag && (
								<List>
									<ListItem
										title={
											<ProfileCard
												profile={
													ownerProfile ?? {
														idTag: ownerIdTag,
														name: ownerIdTag
													}
												}
												srcTag={scope.profileSrcTag}
											/>
										}
										trailing={
											<Badge>
												{ownerIdTag === auth?.idTag && file.owner
													? t('Owner (you)')
													: t('Owner')}
											</Badge>
										}
									/>
								</List>
							)}
						</VBox>

						{isSharingLoading ? (
							<Text emphasis="muted">{t('Loading…')}</Text>
						) : noShares && refsAccess !== 'denied' && refsAccess !== 'error' ? (
							<EmptyState size="sm" description={t('This file is private')} />
						) : (
							<>
								{/* People with access (other than owner) */}
								{allPeople && allPeople.length > 0 ? (
									<List>
										{allPeople.map((entry) => {
											const idTag = entry.subjectId.toString()
											const profile: Profile = peopleProfiles[idTag] ?? {
												idTag,
												name: idTag
											}
											return (
												<ListItem
													key={idTag}
													title={
														<ProfileCard
															profile={profile}
															srcTag={scope.profileSrcTag}
														/>
													}
													trailing={
														<PermChip
															perm={toSharePermChar(entry.permission)}
														/>
													}
												/>
											)
										})}
									</List>
								) : (
									<Text size="sm" emphasis="muted">
										{t('No one else has access yet')}
									</Text>
								)}

								{/* Anyone with the link */}
								<VBox gap={1}>
									<Heading level={4} overline>
										{t('Anyone with the link')}
									</Heading>

									{shareRefs && shareRefs.length > 0 ? (
										<List>
											{shareRefs.map((ref) => {
												const formattedExpiry = formatRefDate(ref.expiresAt)
												// The refId is the credential and never a label -
												// Copy is the way to obtain its value.
												return (
													<ListItem
														key={ref.refId}
														leading={<IcLink />}
														title={ref.description || t('Share link')}
														subtitle={
															formattedExpiry
																? `${t('Expires')} ${formattedExpiry}`
																: t('Never expires')
														}
														trailing={
															<HBox gap={1} align="center">
																<AccessChip
																	level={linkAccessToPermLevel(
																		ref.accessLevel
																	)}
																/>
																{/* Copy and QR need canManageShares, not
																    canReadShares, and a trusted origin -
																    see ShareDialog.tsx for why. */}
																{canUseRefCredential(
																	ref,
																	canShare
																) && (
																	<>
																		<Button
																			variant="ghost"
																			size="sm"
																			icon={<IcCopy />}
																			aria-label={t(
																				'Copy link'
																			)}
																			disabled={
																				!shareOrigin.trusted
																			}
																			disabledReason={
																				credentialUnavailable
																			}
																			onClick={() =>
																				copyShareLink(
																					ref.refId
																				)
																			}
																		/>
																		<Button
																			variant="ghost"
																			size="sm"
																			icon={<IcQrCode />}
																			aria-label={t(
																				'Show QR code'
																			)}
																			disabled={
																				!shareOrigin.trusted
																			}
																			disabledReason={
																				credentialUnavailable
																			}
																			onClick={() =>
																				setQrCodeUrl(
																					`${shareOrigin.href}/s/${ref.refId}`
																				)
																			}
																		/>
																	</>
																)}
															</HBox>
														}
													/>
												)
											})}
										</List>
									) : (
										<Text size="sm" emphasis="muted">
											{refsAccess === 'denied'
												? t(
														"You do not have permission to see this file's share links."
													)
												: refsAccess === 'error'
													? t(
															"Could not load this file's share links. Please try again."
														)
													: t('No share links yet')}
										</Text>
									)}
								</VBox>

								{/* Used in N documents (collapsible footer) */}
								{fileShareEntries && fileShareEntries.length > 0 && (
									<Disclosure
										variant="ghost"
										summary={t('Used in {{count}} documents', {
											count: fileShareEntries.length
										})}
									>
										<List>
											{fileShareEntries.map((entry) => {
												const f = formatRefDate(entry.expiresAt)
												return (
													<ListItem
														key={entry.id}
														leading={
															<FileTypeIcon
																contentType={iconContentType(
																	entry.subjectContentType,
																	entry.subjectFileTp
																)}
																size="sm"
																tile={false}
															/>
														}
														title={
															entry.subjectFileName || entry.subjectId
														}
														subtitle={`${sharePermLabel(
															toSharePermChar(entry.permission),
															t
														)}${f ? ` · ${t('Expires')} ${f}` : ''}`}
													/>
												)
											})}
										</List>
									</Disclosure>
								)}
							</>
						)}
					</VBox>
				</Panel>
			)}
			<QRCodeDialog value={qrCodeUrl} onClose={() => setQrCodeUrl(undefined)} />
		</VBox>
	)
}

// vim: ts=4
