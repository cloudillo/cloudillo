// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import type { ApiClient } from '@cloudillo/core'
import { getFileUrl } from '@cloudillo/core'
import {
	Badge,
	Button,
	Popper,
	ProfileCard,
	QRCodeDialog,
	useAuth,
	useToast
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FiEdit2 as IcEdit, FiMoreVertical as IcMore } from 'react-icons/fi'
import {
	LuChevronDown as IcChevronDown,
	LuCopy as IcCopy,
	LuChevronRight as IcDisclosure,
	LuLink as IcLink,
	LuPin as IcPin,
	LuQrCode as IcQrCode,
	LuShare2 as IcShare,
	LuStar as IcStar
} from 'react-icons/lu'

import {
	activeContextAtom,
	useApiContext,
	useContextAwareApi,
	useCurrentContextIdTag
} from '../../../context/index.js'
import { useShareOrigin } from '../../../utils/appOrigin.js'
import { formatRefDate } from '../../../utils/parseRefDate.js'
import { getCachedProfile, getCachedProfiles } from '../../../utils/profileCache.js'
import { getFileIcon, IcUnknown } from '../icons.js'
import type { File, FileOps } from '../types.js'
import {
	canManageFile,
	formatRelativeTime,
	getVisibilityDropdownOptions,
	getVisibilityIcon,
	getVisibilityLabel
} from '../utils.js'
import { TagsCell } from './TagsCell.js'

type PermLevel = 'READ' | 'COMMENT' | 'WRITE'

function permCharToLevel(perm: string): PermLevel {
	if (perm === 'W' || perm === 'A') return 'WRITE'
	if (perm === 'C') return 'COMMENT'
	return 'READ'
}

function linkAccessToLevel(access: 'read' | 'comment' | 'write' | undefined): PermLevel {
	if (access === 'write') return 'WRITE'
	if (access === 'comment') return 'COMMENT'
	return 'READ'
}

function AccessChip({ level }: { level: PermLevel }) {
	const { t } = useTranslation()
	const label =
		level === 'WRITE' ? t('Editor') : level === 'COMMENT' ? t('Commenter') : t('Viewer')
	const variant = level === 'WRITE' ? 'accent' : level === 'COMMENT' ? 'primary' : 'secondary'
	return <Badge variant={variant}>{label}</Badge>
}

const ELLIPSIS_MARKER = { id: '__ellipsis__', name: '…' } as const
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
		return <span className="text-muted">{t('Loading…')}</span>
	}

	// Empty path on a non-root file means the lookup failed
	// (e.g. parent deleted) — distinguish from the genuine
	// root case where parentId is explicitly null.
	if (path && path.length === 0 && parentId) {
		return <span className="text-muted">{t('Unknown')}</span>
	}

	const segs = path ?? []
	// Abbreviate deeply nested paths so they stay on one line.
	const display: ReadonlyArray<{ id: string; name: string }> =
		segs.length > MAX_INLINE_SEGMENTS
			? [segs[0], ELLIPSIS_MARKER, segs[segs.length - 2], segs[segs.length - 1]]
			: segs

	const goRoot = onNavigate ? () => onNavigate(null) : undefined
	const goSegment = (id: string) => (onNavigate ? () => onNavigate(id) : undefined)

	return (
		<span className="c-hbox g-1 align-items-center flex-wrap">
			{goRoot ? (
				<button type="button" className="c-link p-0" onClick={goRoot}>
					{t('Files')}
				</button>
			) : (
				<span>{t('Files')}</span>
			)}
			{display.map((seg, idx) => (
				<React.Fragment key={`${idx}-${seg.id}`}>
					<span className="text-muted">/</span>
					{seg === ELLIPSIS_MARKER ? (
						<span className="text-muted">{seg.name}</span>
					) : goSegment(seg.id) ? (
						<button
							type="button"
							className="c-link p-0 text-truncate"
							onClick={goSegment(seg.id)}
							title={seg.name}
						>
							{seg.name}
						</button>
					) : (
						<span className="text-truncate" title={seg.name}>
							{seg.name}
						</span>
					)}
				</React.Fragment>
			))}
		</span>
	)
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
	// the context-aware API when not supplied.
	apiOverride?: ApiClient | null
}

export function DetailsPanel({
	file,
	fileOps,
	onShare,
	onNavigateToFolder,
	apiOverride
}: DetailsPanelProps) {
	const { t } = useTranslation()
	const { api: contextApi } = useContextAwareApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const contextIdTag = useCurrentContextIdTag()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)

	const fileOwnerIdTag = file.owner?.idTag
	const isCrossOwner =
		apiOverride === undefined &&
		!!fileOwnerIdTag &&
		!!contextIdTag &&
		fileOwnerIdTag !== contextIdTag

	const [ownerApi, setOwnerApi] = React.useState<ApiClient | null>(null)

	React.useEffect(
		function acquireOwnerApi() {
			if (!isCrossOwner || !fileOwnerIdTag) {
				setOwnerApi(null)
				return
			}
			let cancelled = false
			;(async function () {
				try {
					const tokenResult = await getTokenFor(fileOwnerIdTag, { explicit: true })
					if (cancelled) return
					const client = tokenResult
						? getClientFor(fileOwnerIdTag, { token: tokenResult.token })
						: null
					if (!cancelled) setOwnerApi(client)
				} catch {
					if (!cancelled) setOwnerApi(null)
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[isCrossOwner, fileOwnerIdTag, getTokenFor, getClientFor]
	)

	const api = apiOverride !== undefined ? apiOverride : isCrossOwner ? ownerApi : contextApi
	const toast = useToast()
	// Share URLs must point at the tenant that holds the ref (file owner, or the
	// active context) — its app/web domain, not the API host.
	const shareOrigin =
		useShareOrigin(api, file.owner?.idTag ?? contextIdTag) ?? window.location.origin
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[] | undefined>()
	const [userShareEntries, setUserShareEntries] = React.useState<Types.ShareEntry[] | undefined>()
	const [fileShareEntries, setFileShareEntries] = React.useState<Types.ShareEntry[] | undefined>()
	const [peopleProfiles, setPeopleProfiles] = React.useState<Record<string, Profile>>({})
	const [ownerProfile, setOwnerProfile] = React.useState<Profile | null>(null)
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()
	const [usedInOpen, setUsedInOpen] = React.useState(false)
	const [filePath, setFilePath] = React.useState<{ id: string; name: string }[] | undefined>(
		file.path
	)
	// Intentionally per-panel: cache dies with the details overlay (panel
	// unmounts on navigate/close), so unbounded growth isn't a concern.
	const pathCacheRef = React.useRef<Map<string, { id: string; name: string }[]>>(new Map())

	const Icon = getFileIcon(file.contentType, file.fileTp)
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
		function loadFileDetails() {
			if (!api) return

			let cancelled = false

			;(async function () {
				try {
					const refs = await api.refs.list({
						type: 'share.file',
						resourceId: file.fileId
					})
					if (!cancelled) setShareRefs(refs)
				} catch (err) {
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
		[api, file.fileId]
	)

	const ownerIdTag = file.owner?.idTag ?? contextIdTag

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
		[ownerIdTag, file.owner, contextIdTag, api]
	)

	React.useEffect(
		function loadFilePath() {
			if (!api) return

			// Key by api source so switching between local/remote with the
			// same fileId doesn't return a path from the wrong context.
			const cacheKey = `${apiOverride ? 'remote' : isCrossOwner ? `owner:${fileOwnerIdTag}` : 'local'}:${file.fileId}`

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
		[api, apiOverride, isCrossOwner, fileOwnerIdTag, file.fileId, file.path]
	)

	function copyShareLink(refId: string) {
		const url = `${shareOrigin}/s/${refId}`
		navigator.clipboard.writeText(url)
		toast.success(t('Link copied to clipboard'))
	}

	const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
	const canManage = canManageFile(file, auth?.idTag, activeContext?.roles ?? [])

	const sharedPeopleCount = allPeople?.length ?? 0
	const sharedLinkCount = shareRefs?.length ?? 0
	const isSharingLoading = userShareEntries === undefined || shareRefs === undefined
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

	return (
		<div className="c-vbox g-2">
			{/* Header — subject of the panel — and quick-actions toolbar */}
			<div className="c-panel mid c-details-subject">
				<div className="c-details-header">
					<div className="c-details-thumb">
						{isImage && (fileOwnerIdTag || contextIdTag) ? (
							<img
								src={getFileUrl(
									fileOwnerIdTag || contextIdTag!,
									file.fileId,
									'vis.sd'
								)}
								alt={file.fileName}
							/>
						) : file.variantId && (fileOwnerIdTag || contextIdTag) ? (
							<img
								src={getFileUrl(
									fileOwnerIdTag || contextIdTag!,
									file.variantId,
									'vis.sd'
								)}
								alt={file.fileName}
							/>
						) : (
							<Icon />
						)}
					</div>
					<div className="c-details-title">
						<h2 title={file.fileName}>{file.fileName}</h2>
						{(file.contentType || file.owner?.name) && (
							<div className="text-secondary text-small">
								{[file.contentType, file.owner?.name].filter(Boolean).join(' · ')}
							</div>
						)}
					</div>
				</div>

				{/* Quick actions toolbar */}
				<div className="c-details-actions c-hbox g-1">
					{!isFolder && (
						<Button
							kind="link"
							title={t('Open')}
							onClick={() =>
								fileOps.openFile(
									file.fileId,
									file.accessLevel === 'none' ? 'read' : file.accessLevel
								)
							}
						>
							<IcEdit />
						</Button>
					)}
					<Button
						kind="link"
						aria-pressed={!!file.userData?.starred}
						className={file.userData?.starred ? 'text-accent' : ''}
						title={file.userData?.starred ? t('Starred') : t('Star')}
						onClick={() => fileOps.toggleStarred?.(file.fileId)}
					>
						<IcStar />
					</Button>
					<Button
						kind="link"
						aria-pressed={!!file.userData?.pinned}
						className={file.userData?.pinned ? 'text-accent' : ''}
						title={file.userData?.pinned ? t('Pinned') : t('Pin')}
						onClick={() => fileOps.togglePinned?.(file.fileId)}
					>
						<IcPin />
					</Button>
					{onShare && canManage && (
						<Button kind="link" title={t('Share')} onClick={() => onShare(file)}>
							<IcShare />
						</Button>
					)}
					<Popper className="c-link ms-auto" icon={<IcMore />}>
						<ul className="c-nav vertical">
							<li className="c-nav-item">
								<a onClick={() => fileOps.renameFile(file.fileId)}>
									{t('Rename...')}
								</a>
							</li>
						</ul>
					</Popper>
				</div>
			</div>

			{/* Properties */}
			<div className="c-panel mid">
				<dl className="c-description-list">
					<dt>{t('Visibility')}</dt>
					<dd>
						{canManage && fileOps.setVisibility ? (
							<Popper
								menuClassName="c-button secondary c-hbox g-2 align-items-center"
								icon={
									<>
										<VisibilityIcon className="me-2" />
										{getVisibilityLabel(t, file.visibility ?? null)}
									</>
								}
								label={<IcChevronDown />}
							>
								<ul className="c-nav vertical">
									{getVisibilityDropdownOptions(t).map((opt) => {
										const OptionIcon = opt.icon
										const isCurrentVisibility =
											(file.visibility ?? null) === opt.value
										return (
											<li key={opt.value ?? 'null'} className="c-nav-item">
												<a
													className={isCurrentVisibility ? 'active' : ''}
													onClick={() =>
														fileOps.setVisibility!(
															file.fileId,
															opt.value
														)
													}
												>
													<OptionIcon className="me-2" />
													{opt.label}
												</a>
											</li>
										)
									})}
								</ul>
							</Popper>
						) : (
							<span className="c-hbox g-2 align-items-center">
								<VisibilityIcon />
								{getVisibilityLabel(t, file.visibility ?? null)}
							</span>
						)}
					</dd>

					{file.owner?.name && (
						<>
							<dt>{t('Owner')}</dt>
							<dd>{file.owner.name}</dd>
						</>
					)}

					<dt>{t('Location')}</dt>
					<dd>
						<PathBreadcrumb
							path={filePath}
							parentId={file.parentId}
							onNavigate={onNavigateToFolder}
						/>
					</dd>

					{file.contentType && (
						<>
							<dt>{t('Type')}</dt>
							<dd>{file.contentType}</dd>
						</>
					)}

					<dt>{t('Created')}</dt>
					<dd>{formatRelativeTime(file.createdAt)}</dd>

					{file.userData?.modifiedAt && (
						<>
							<dt>{t('Last edited')}</dt>
							<dd>{formatRelativeTime(file.userData.modifiedAt)}</dd>
						</>
					)}

					{file.userData?.accessedAt && (
						<>
							<dt>{t('Last opened')}</dt>
							<dd>{formatRelativeTime(file.userData.accessedAt)}</dd>
						</>
					)}

					<dt>{t('Tags')}</dt>
					<dd>
						<TagsCell fileId={file.fileId} tags={file.tags} editable />
					</dd>
				</dl>
			</div>

			{canManage && (
				<div className="c-panel mid">
					<div className="c-panel-header c-hbox g-2 align-items-center">
						<h3 className="flex-fill">
							{t('Sharing')}
							{sharingSummary && (
								<span className="text-secondary text-small ms-2">
									{sharingSummary}
								</span>
							)}
						</h3>
						{onShare && (
							<Button
								size="small"
								title={t('Manage sharing')}
								aria-label={t('Manage sharing')}
								onClick={() => onShare(file)}
							>
								<IcShare />
							</Button>
						)}
					</div>
					<div className="c-vbox g-3">
						{/* People with access — Owner row always visible */}
						<div className="c-vbox g-1">
							<h4 className="mb-2 text-secondary text-uppercase text-small">
								{t('People with access')}
							</h4>

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
										{ownerIdTag === auth?.idTag && file.owner && (
											<span className="text-secondary">({t('you')})</span>
										)}
									</div>
									<span className="c-badge">{t('Owner')}</span>
								</div>
							)}
						</div>

						{isSharingLoading ? (
							<span className="text-secondary">{t('Loading…')}</span>
						) : (
							<>
								{/* People with access (other than owner) */}
								<div className="c-vbox g-1">
									{allPeople?.map((entry) => {
										const idTag = entry.subjectId.toString()
										const profile: Profile = peopleProfiles[idTag] ?? {
											idTag,
											name: idTag
										}
										const level = permCharToLevel(entry.permission.toString())
										return (
											<div
												key={idTag}
												className="c-hbox g-2 align-items-center p-2"
											>
												<div className="flex-fill text-truncate">
													<ProfileCard profile={profile} />
												</div>
												<AccessChip level={level} />
											</div>
										)
									})}

									{allPeople?.length === 0 && (
										<div className="text-secondary text-small px-2">
											{t('No one else has access yet')}
										</div>
									)}
								</div>

								{/* Anyone with the link */}
								<div className="c-vbox g-1">
									<h4 className="mb-2 text-secondary text-uppercase text-small">
										{t('Anyone with the link')}
									</h4>

									{shareRefs?.map((ref) => {
										const formattedExpiry = formatRefDate(ref.expiresAt)
										const expiryText = formattedExpiry
											? `${t('Expires')} ${formattedExpiry}`
											: t('Never expires')
										return (
											<div
												key={ref.refId}
												className="c-hbox g-2 align-items-center p-2"
											>
												<IcLink className="flex-shrink-0" />
												<div className="flex-fill text-truncate">
													<div>{ref.description || ref.refId}</div>
													<div className="text-secondary text-small">
														{expiryText}
													</div>
												</div>
												<AccessChip
													level={linkAccessToLevel(ref.accessLevel)}
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
											</div>
										)
									})}

									{shareRefs?.length === 0 && (
										<div className="text-secondary text-small px-2">
											{t('No share links yet')}
										</div>
									)}
								</div>

								{/* Used in N documents (collapsible footer) */}
								{fileShareEntries && fileShareEntries.length > 0 && (
									<div className="mt-2">
										<button
											type="button"
											className="c-link p-2 c-hbox g-2 align-items-center text-secondary"
											onClick={() => setUsedInOpen((v) => !v)}
										>
											<IcDisclosure
												style={{
													transform: usedInOpen
														? 'rotate(90deg)'
														: undefined,
													transition: 'transform 0.15s'
												}}
											/>
											<span>
												{t('Used in {{count}} documents', {
													count: fileShareEntries.length
												})}
											</span>
										</button>
										{usedInOpen && (
											<div className="c-vbox g-2 mt-2">
												{fileShareEntries.map((entry) => {
													const EntryIcon = entry.subjectContentType
														? getFileIcon(
																entry.subjectContentType,
																entry.subjectFileTp
															)
														: IcUnknown
													return (
														<div
															key={entry.id}
															className="c-hbox g-2 align-items-center p-2"
														>
															{React.createElement<
																React.ComponentProps<
																	typeof IcUnknown
																>
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
														</div>
													)
												})}
											</div>
										)}
									</div>
								)}

								{/* Empty state */}
								{(allPeople?.length ?? 0) === 0 &&
									(shareRefs?.length ?? 0) === 0 &&
									(fileShareEntries?.length ?? 0) === 0 && (
										<div className="c-vbox g-2 align-items-center text-center py-2">
											<div className="text-secondary">
												{t('This file is private')}
											</div>
											{onShare && (
												<Button onClick={() => onShare(file)}>
													<IcShare /> {t('Share file')}
												</Button>
											)}
										</div>
									)}
							</>
						)}
					</div>
				</div>
			)}
			<QRCodeDialog value={qrCodeUrl} onClose={() => setQrCodeUrl(undefined)} />
		</div>
	)
}

// vim: ts=4
