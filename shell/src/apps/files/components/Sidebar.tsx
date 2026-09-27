// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TagInfo } from '@cloudillo/core'
import {
	AppIcon,
	type AppId,
	Button,
	Divider,
	HBox,
	Menu,
	MenuItem,
	Nav,
	SearchInput,
	Segmented,
	SegmentedItem,
	Tag,
	Text,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
	LuFolderOpen as IcBrowse,
	LuStar as IcFavorites,
	LuShieldCheck as IcManaged,
	LuFilePlus2 as IcNewFile,
	LuClock as IcRecent,
	LuTag as IcTag,
	LuTrash2 as IcTrash
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { useContextAwareApi, useCtx } from '../../../context/index.js'
import { appPath } from '../../../routes.js'
import type { FileTypeFilter, OwnerFilter, ViewMode } from '../types.js'

const createItems = (t: TFunction): { app: AppId; db?: boolean; label: string }[] => [
	{ app: 'quillo', label: t('Quillo text document') },
	{ app: 'calcillo', label: t('Calcillo spreadsheet document') },
	{ app: 'ideallo', label: t('Ideallo whiteboard document') },
	{ app: 'prezillo', label: t('Prezillo presentation document') },
	{ app: 'taskillo', db: true, label: t('Taskillo task list') },
	{ app: 'notillo', db: true, label: t('Notillo wiki') },
	{ app: 'scanillo', db: true, label: t('Scanillo document scanner') }
]

const viewItems = (
	t: TFunction
): { mode: ViewMode; icon: React.ComponentType; label: string }[] => [
	{ mode: 'browse', icon: IcBrowse, label: t('Browse') },
	{ mode: 'starred', icon: IcFavorites, label: t('Starred') },
	{ mode: 'recent', icon: IcRecent, label: t('Recent') },
	{ mode: 'trash', icon: IcTrash, label: t('Trash') },
	{ mode: 'managed', icon: IcManaged, label: t('Managed') }
]

interface SidebarProps {
	className?: string
	contextIdTag?: string
	currentFolderId?: string | null
	viewMode: ViewMode
	onViewModeChange: (mode: ViewMode) => void
	fileTypeFilter: FileTypeFilter
	onFileTypeFilterChange: (filter: FileTypeFilter) => void
	ownerFilter: OwnerFilter
	onOwnerFilterChange: (filter: OwnerFilter) => void
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	selectedTags?: string[]
	onTagFilter?: (tags: string[]) => void
}

export const Sidebar = React.memo(function Sidebar({
	className,
	contextIdTag,
	currentFolderId,
	viewMode,
	onViewModeChange,
	fileTypeFilter,
	onFileTypeFilterChange,
	ownerFilter,
	onOwnerFilterChange,
	searchQuery,
	onSearchQueryChange,
	selectedTags = [],
	onTagFilter
}: SidebarProps) {
	const { t } = useTranslation()
	// `authenticated` is a dep of the tag-load effect below: the api client's
	// identity is stable per idTag, so this flag (not `api`, and not `auth`,
	// which tracks the home session) is what changes when a context token lands.
	const { api, authenticated } = useContextAwareApi()
	const [auth] = useAuth()
	// URL form of the context (`~` at home); the resId below carries the real owner.
	const urlCtx = useCtx().base
	const navigate = useNavigate()
	const dialog = useDialog()

	// Tags with counts for tag cloud
	const [tags, setTags] = React.useState<TagInfo[]>([])

	// Load tags with counts
	React.useEffect(
		function loadTags() {
			if (!api || !auth) return

			;(async function () {
				try {
					const res = await api.tags.list({ withCounts: true, limit: 10 })
					setTags(res.tags)
				} catch {
					// Ignore errors loading tags
				}
			})()
		},
		[api, authenticated, auth]
	)

	const toggleTag = React.useCallback(
		function toggleTag(tag: string) {
			if (!onTagFilter) return

			const newTags = selectedTags.includes(tag)
				? selectedTags.filter((t) => t !== tag)
				: [...selectedTags, tag]
			onTagFilter(newTags)
		},
		[selectedTags, onTagFilter]
	)

	const clearTags = React.useCallback(
		function clearTags() {
			if (onTagFilter) onTagFilter([])
		},
		[onTagFilter]
	)

	async function createFile(contentType: string) {
		if (!contentType || !api) return

		const fileName = await dialog.askText(
			t('Create document'),
			t('Provide a name for the new document'),
			{ placeholder: t('Untitled document') }
		)
		if (fileName === undefined) return

		const res = await api.files.create({
			fileTp: 'CRDT',
			contentType,
			parentId: currentFolderId || undefined
		})
		if (res?.fileId) {
			await api.files.update(res.fileId, {
				fileName: (fileName || t('Untitled document')) as string
			})

			// `contextIdTag` is the real idTag: it belongs in the resId's owner half,
			// never in the context segment.
			const ownerTag = contextIdTag || auth?.idTag
			const docPath = (appId: string) => appPath(urlCtx, appId, `${ownerTag}:${res.fileId}`)

			switch (contentType) {
				case 'cloudillo/quillo':
					navigate(docPath('quillo'))
					break
				case 'cloudillo/calcillo':
					navigate(docPath('calcillo'))
					break
				case 'cloudillo/ideallo':
					navigate(docPath('ideallo'))
					break
				case 'cloudillo/prezillo':
					navigate(docPath('prezillo'))
					break
				case 'cloudillo/formillo':
					navigate(docPath('formillo'))
					break
				case 'cloudillo/taskillo':
					navigate(docPath('taskillo'))
					break
			}
		}
	}

	async function createDb(contentType: string) {
		if (!contentType || !api) return

		const fileName = await dialog.askText(
			t('Create database'),
			t('Provide a name for the new database'),
			{ placeholder: t('Untitled database') }
		)
		if (fileName === undefined) return

		const res = await api.files.create({
			fileTp: 'RTDB',
			contentType,
			parentId: currentFolderId || undefined
		})
		if (res?.fileId) {
			await api.files.update(res.fileId, {
				fileName: (fileName || t('Untitled database')) as string
			})

			const ownerTag = contextIdTag || auth?.idTag
			const docPath = (appId: string) => appPath(urlCtx, appId, `${ownerTag}:${res.fileId}`)

			switch (contentType) {
				case 'cloudillo/taskillo':
					navigate(docPath('taskillo'))
					break
				case 'cloudillo/notillo':
					navigate(docPath('notillo'))
					break
				case 'cloudillo/scanillo':
					navigate(docPath('scanillo'))
					break
			}
		}
	}

	return (
		<VBox gap={2} className={className} autoBg>
			{!!auth && (
				<>
					<Menu
						trigger={
							<Button variant="ghost" icon={<IcNewFile />}>
								{t('Create document')}
							</Button>
						}
					>
						{createItems(t).map(({ app, db, label }) => (
							<MenuItem
								key={app}
								icon={<AppIcon app={app} size="sm" tile={false} />}
								label={label}
								onClick={() =>
									db
										? createDb(`cloudillo/${app}`)
										: createFile(`cloudillo/${app}`)
								}
							/>
						))}
					</Menu>
					<Divider />
				</>
			)}

			<Nav aria-label={t('Files')}>
				{viewItems(t).map(({ mode, icon: ViewIcon, label }) => (
					<Nav.Item
						key={mode}
						icon={<ViewIcon />}
						label={label}
						active={viewMode === mode}
						onClick={() => onViewModeChange(mode)}
					/>
				))}
			</Nav>

			<Divider />

			<SearchInput
				aria-label={t('Search files...')}
				placeholder={t('Search files...')}
				value={searchQuery}
				onChange={(e) => onSearchQueryChange(e.target.value)}
			/>

			<Text size="sm" emphasis="muted">
				{t('Type')}
			</Text>
			<Segmented
				size="sm"
				fill
				aria-label={t('Type')}
				value={fileTypeFilter}
				onChange={(v) => onFileTypeFilterChange(v as FileTypeFilter)}
			>
				<SegmentedItem value="all">{t('All')}</SegmentedItem>
				<SegmentedItem value="live">{t('Live')}</SegmentedItem>
				<SegmentedItem value="static">{t('Static')}</SegmentedItem>
			</Segmented>

			<Text size="sm" emphasis="muted">
				{t('Owner')}
			</Text>
			<Segmented
				size="sm"
				fill
				aria-label={t('Owner')}
				value={ownerFilter}
				onChange={(v) => onOwnerFilterChange(v as OwnerFilter)}
			>
				<SegmentedItem value="anyone">{t('Anyone')}</SegmentedItem>
				<SegmentedItem value="me">{t('Me')}</SegmentedItem>
				<SegmentedItem value="others">{t('Others')}</SegmentedItem>
			</Segmented>

			{tags.length > 0 && (
				<>
					<Divider />
					<HBox gap={1} align="center">
						<Text size="sm" emphasis="muted" className="flex-fill">
							<IcTag /> {t('Tags')}
						</Text>
						{selectedTags.length > 0 && (
							<Button variant="ghost" size="sm" onClick={clearTags}>
								{t('Clear')}
							</Button>
						)}
					</HBox>
					<HBox gap={1} wrap>
						{tags.map((tagInfo) => (
							<Tag
								key={tagInfo.tag}
								pressed={selectedTags.includes(tagInfo.tag)}
								count={tagInfo.count}
								onClick={() => toggleTag(tagInfo.tag)}
							>
								{tagInfo.tag}
							</Tag>
						))}
					</HBox>
				</>
			)}
		</VBox>
	)
})

// vim: ts=4
