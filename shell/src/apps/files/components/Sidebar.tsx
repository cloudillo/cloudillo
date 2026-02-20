// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { FiSearch as IcSearch } from 'react-icons/fi'
import {
	LuFilePlus2 as IcNewFile,
	LuCloud as IcAll,
	LuFilePen as IcMutable,
	LuFile as IcImmutable,
	LuStar as IcFavorites,
	LuClock as IcRecent,
	LuTrash2 as IcTrash,
	LuTag as IcTag,
	LuPin as IcPin
} from 'react-icons/lu'

import { useAuth, useDialog, Button, Popper, mergeClasses } from '@cloudillo/react'
import type { TagInfo } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'
import { fileIcons, IcUnknown } from '../icons.js'
import type { ViewMode } from '../types.js'

interface SidebarProps {
	className?: string
	contextIdTag?: string
	currentFolderId?: string | null
	viewMode: ViewMode
	onViewModeChange: (mode: ViewMode) => void
	selectedTags?: string[]
	onTagFilter?: (tags: string[]) => void
}

export const Sidebar = React.memo(function Sidebar({
	className,
	contextIdTag,
	currentFolderId,
	viewMode,
	onViewModeChange,
	selectedTags = [],
	onTagFilter
}: SidebarProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const navigate = useNavigate()
	const dialog = useDialog()

	// Tags with counts for tag cloud
	const [tags, setTags] = React.useState<TagInfo[]>([])

	// Load tags with counts
	React.useEffect(
		function loadTags() {
			if (!api) return

			;(async function () {
				try {
					const res = await api.tags.list({ withCounts: true, limit: 10 })
					setTags(res.tags)
				} catch {
					// Ignore errors loading tags
				}
			})()
		},
		[api]
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

			const appPath = (appId: string) =>
				`/app/${contextIdTag || auth?.idTag}/${appId}/${res.fileId}`

			switch (contentType) {
				case 'cloudillo/quillo':
					navigate(appPath('quillo'))
					break
				case 'cloudillo/calcillo':
					navigate(appPath('calcillo'))
					break
				case 'cloudillo/ideallo':
					navigate(appPath('ideallo'))
					break
				case 'cloudillo/prezillo':
					navigate(appPath('prezillo'))
					break
				case 'cloudillo/formillo':
					navigate(appPath('formillo'))
					break
				case 'cloudillo/taskillo':
					navigate(appPath('taskillo'))
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

			const appPath = (appId: string) =>
				`/app/${contextIdTag || auth?.idTag}/${appId}/${res.fileId}`

			switch (contentType) {
				case 'cloudillo/taskillo':
					navigate(appPath('taskillo'))
					break
				case 'cloudillo/notillo':
					navigate(appPath('notillo'))
					break
			}
		}
	}

	return (
		<ul className={mergeClasses('c-nav vertical low', className)}>
			{/* Create document menu */}
			{!!auth && (
				<>
					<li className="c-nav-item">
						<Popper icon={<IcNewFile />} label={t('Create document')}>
							<ul className="c-nav vertical emph">
								<li>
									<Button navItem onClick={() => createFile('cloudillo/quillo')}>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/quillo'], { className: 'me-1' })}
										{t('Quillo text document')}
									</Button>
								</li>
								<li>
									<Button
										navItem
										onClick={() => createFile('cloudillo/calcillo')}
									>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/calcillo'], { className: 'me-1' })}
										{t('Calcillo spreadsheet document')}
									</Button>
								</li>
								<li>
									<Button
										navItem
										//										disabled={true || process.env.NODE_ENV === 'production'}
										onClick={() => createFile('cloudillo/ideallo')}
									>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/ideallo'], { className: 'me-1' })}
										{t('Ideallo whiteboard document')}
									</Button>
								</li>
								<li>
									<Button
										navItem
										onClick={() => createFile('cloudillo/prezillo')}
									>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/prezillo'], { className: 'me-1' })}
										{t('Prezillo presentation document')}
									</Button>
								</li>
								<li>
									<Button navItem onClick={() => createDb('cloudillo/taskillo')}>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/taskillo'], { className: 'me-1' })}
										{t('Taskillo task list')}
									</Button>
								</li>
								<li>
									<Button navItem onClick={() => createDb('cloudillo/notillo')}>
										{React.createElement<
											React.ComponentProps<typeof IcUnknown>
										>(fileIcons['cloudillo/notillo'], { className: 'me-1' })}
										{t('Notillo wiki')}
									</Button>
								</li>
							</ul>
						</Popper>
					</li>
					<hr className="w-100" />
				</>
			)}

			{/* Navigation section */}
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'all' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('all')
					}}
				>
					<IcAll /> {t('All files')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'live' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('live')
					}}
				>
					<IcMutable /> {t('Live')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'static' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('static')
					}}
				>
					<IcImmutable /> {t('Static')}
				</a>
			</li>

			<hr className="w-100" />

			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'starred' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('starred')
					}}
				>
					<IcFavorites /> {t('Starred')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'recent' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('recent')
					}}
				>
					<IcRecent /> {t('Recent')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'pinned' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('pinned')
					}}
				>
					<IcPin /> {t('Pinned')}
				</a>
			</li>

			<hr className="w-100" />

			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'trash' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('trash')
					}}
				>
					<IcTrash /> {t('Trash')}
				</a>
			</li>

			<hr className="w-100" />

			{/* Search */}
			<div className="c-input-group">
				<input type="text" className="c-input" placeholder={t('Search')} />
				<Button secondary>
					<IcSearch />
				</Button>
			</div>

			{/* Tag Cloud */}
			{tags.length > 0 && (
				<>
					<hr className="w-100" />
					<li className="c-nav-item">
						<span className="c-nav-link text-muted">
							<IcTag /> {t('Tags')}
							{selectedTags.length > 0 && (
								<Button className="ms-auto" size="small" onClick={clearTags}>
									{t('Clear')}
								</Button>
							)}
						</span>
					</li>
					<div className="d-flex flex-wrap g-1 px-2">
						{tags.map((tagInfo) => (
							<button
								key={tagInfo.tag}
								type="button"
								className={mergeClasses(
									'c-tag',
									selectedTags.includes(tagInfo.tag) && 'accent'
								)}
								onClick={() => toggleTag(tagInfo.tag)}
							>
								{tagInfo.tag}
								{tagInfo.count !== undefined && (
									<span className="c-badge xs ms-1">{tagInfo.count}</span>
								)}
							</button>
						))}
					</div>
				</>
			)}
		</ul>
	)
})

// vim: ts=4
