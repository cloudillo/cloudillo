// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import {
	Breadcrumbs,
	Button,
	DescriptionList,
	type DescriptionListItem,
	FileTypeIcon,
	HBox,
	Heading,
	IcDropdown,
	IcEdit,
	IcMore,
	IconText,
	IcPin,
	IcShare,
	IcView,
	Menu,
	MenuItem,
	Panel,
	Text,
	Thumbnail,
	VBox
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useCurrentContextIdTag } from '../../../context/index.js'
import { IcStar } from '../../../icons.js'
import { useFileAccess } from '../hooks/useFileAccess.js'
import { type FileOwnerScopeOverride, useFileOwnerScope } from '../hooks/useFileOwnerScope.js'
import type { File, FileOps } from '../types.js'
import {
	canWrite,
	formatRelativeTime,
	getVisibilityDropdownOptions,
	getVisibilityIcon,
	getVisibilityLabel,
	toAppAccess
} from '../utils.js'
import { AccessList } from './AccessList.js'
import { LocationChip } from './LocationChip.js'
import { TagsCell } from './TagsCell.js'

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

	// Which node holds this file and whose roles decide what we may do with it. Shared with the
	// ShareDialog this panel opens - see useFileOwnerScope for why they must not derive it twice.
	const scope = useFileOwnerScope(file, ownerScope)
	const { api, isCrossOwner, upstreamIdTag, scopedId } = scope
	// `resolving` is not enough: the owner branch of canManageFile needs no roles, so an own file
	// reads as manageable while `api` is still null. Requiring the client too is what stops the
	// affordance rendering before the node it targets exists.
	const scopeReady = !scope.resolving && !!scope.api
	// Off the scope, i.e. from whichever node `api` points at - never the active context.
	const canManage = scopeReady && scope.canManageFile
	// Who has access, shaped by the backend to our own level - the same list the bar's access
	// popover shows. Copy/QR per link and "Used in N documents" live in ShareDialog only.
	const { access, error: accessError } = useFileAccess(file, ownerScope)
	const [filePath, setFilePath] = React.useState<{ id: string; name: string }[] | undefined>(
		file.path
	)
	// Intentionally per-panel: cache dies with the details overlay (panel
	// unmounts on navigate/close), so unbounded growth isn't a concern.
	const pathCacheRef = React.useRef<Map<string, { id: string; name: string }[]>>(new Map())

	const isImage = file.contentType?.startsWith('image/')
	const isFolder = file.fileTp === 'FLDR'

	React.useEffect(
		function loadFilePath() {
			if (!api) return

			// Key by api source so switching between local/remote with the
			// same id doesn't return a path from the wrong context.
			const cacheKey = `${ownerScope ? 'remote' : isCrossOwner ? `upstream:${upstreamIdTag}` : 'local'}:${scopedId}`

			// Use path already on the file if present (from a withPath listing).
			if (file.path) {
				pathCacheRef.current.set(cacheKey, file.path)
				setFilePath(file.path)
				return
			}

			if (!scopedId) {
				setFilePath([])
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
					const results = await api.files.list({ fileId: scopedId, withPath: true })
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
		[api, ownerScope, isCrossOwner, upstreamIdTag, scopedId, file.path]
	)

	const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)

	// The host that serves the thumbnail is the one holding the blob - the upstream node for a
	// mirrored row, otherwise whichever tenant the scope points at.
	const thumbIdTag = upstreamIdTag || scope.scopeIdTag || contextIdTag
	const thumbId = isImage ? file.fileId : file.variantId
	const thumbSrc = thumbId && thumbIdTag ? getFileUrl(thumbIdTag, thumbId, 'vis.sd') : undefined

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
								<IcDropdown />
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
											file.entryId,
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
						description: <LocationChip file={file} roomOnly />
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
					entryId={file.entryId}
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
								fileOps.openFile(file.entryId, toAppAccess(file.accessLevel))
							}
						/>
					)}
					<Button
						variant="ghost"
						icon={<IcStar />}
						pressed={!!file.userData?.starred}
						aria-label={file.userData?.starred ? t('Starred') : t('Star')}
						onClick={() => fileOps.toggleStarred?.(file.entryId)}
					/>
					<Button
						variant="ghost"
						icon={<IcPin />}
						pressed={!!file.userData?.pinned}
						aria-label={file.userData?.pinned ? t('Pinned') : t('Pin')}
						onClick={() => fileOps.togglePinned?.(file.entryId)}
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
								onClick={() => fileOps.renameFile(file.entryId)}
							/>
						</Menu>
					)}
				</HBox>
			</Panel>

			{/* Properties */}
			<Panel>
				<DescriptionList items={properties} />
			</Panel>

			<Panel
				title={t('Sharing')}
				headingLevel={3}
				actions={
					// A reader may OPEN the dialog - it renders a complete read-only variant.
					// Only the label changes.
					onShare && (
						<Button size="sm" icon={<IcShare />} onClick={() => onShare(file)}>
							{access?.canManage ? t('Manage sharing') : t('View sharing')}
						</Button>
					)
				}
			>
				{access ? (
					<AccessList access={access} onNavigateToFolder={onNavigateToFolder} />
				) : (
					<Text size="sm" emphasis="muted">
						{accessError
							? t('Could not load who has access. Please try again.')
							: t('Loading…')}
					</Text>
				)}
			</Panel>
		</VBox>
	)
}

// vim: ts=4
