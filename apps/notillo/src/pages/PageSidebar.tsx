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
import {
	PiPlusBold as IcPlus,
	PiFilePlusBold as IcAddSubpage,
	PiTrashBold as IcDelete,
	PiFileBold as IcPage,
	PiXBold as IcClose,
	PiPushPinBold as IcPin,
	PiDotsThreeVerticalBold as IcMore,
	PiMagnifyingGlassBold as IcSearch
} from 'react-icons/pi'

import { useDialog, Button, TreeView, TreeItem, type TreeItemDragData } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { createPage, deletePage, movePage, isAncestor, pinToSidebar } from '../rtdb/page-ops.js'
import { checkConsistency, fixConsistency } from '../rtdb/consistency.js'

interface PageSidebarProps {
	client: RtdbClient
	pages: Map<string, PageRecord & { id: string }>
	pagesWithChildren: Set<string>
	expanded: Set<string>
	loadingChildren: Set<string>
	orphanPage: (PageRecord & { id: string }) | null
	onExpand: (pageId: string) => void
	onCollapse: (pageId: string) => void
	onToggleExpand: (pageId: string) => void
	activePageId: string | undefined
	onSelectPage: (pageId: string) => void
	userId: string
	readOnly: boolean
	tags: Set<string>
	tagCounts: Map<string, number>
	activeTag: string | null
	onSelectTag: (tag: string) => void
	onClearTag: () => void
	searchQuery: string
	onSearchChange: (query: string) => void
	filteredResults: Array<{ id: string; title: string; icon?: string; tags?: string[] }>
	isFiltering: boolean
}

export function PageSidebar({
	client,
	pages,
	pagesWithChildren,
	expanded,
	loadingChildren,
	orphanPage,
	onExpand,
	onCollapse,
	onToggleExpand,
	activePageId,
	onSelectPage,
	userId,
	readOnly,
	tags,
	tagCounts,
	activeTag,
	onSelectTag,
	onClearTag,
	searchQuery,
	onSearchChange,
	filteredResults,
	isFiltering
}: PageSidebarProps) {
	const dialog = useDialog()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)

	const [draggedId, setDraggedId] = React.useState<string | null>(null)
	const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
	const [dropPosition, setDropPosition] = React.useState<'before' | 'after' | 'inside' | null>(
		null
	)

	// Build tree structure from flat pages
	const rootPages = React.useMemo(() => {
		const roots: Array<PageRecord & { id: string }> = []
		for (const page of pages.values()) {
			if (page.parentPageId === '__root__') {
				roots.push(page)
			}
		}
		return roots.sort((a, b) => a.order - b.order)
	}, [pages])

	const getChildren = React.useCallback(
		(parentId: string) => {
			const children: Array<PageRecord & { id: string }> = []
			for (const page of pages.values()) {
				if (page.parentPageId === parentId) {
					children.push(page)
				}
			}
			return children.sort((a, b) => a.order - b.order)
		},
		[pages]
	)

	const handleCreatePage = React.useCallback(async () => {
		const id = await createPage(client, userId, 'New Page', '__root__')
		onSelectPage(id)
	}, [client, userId, onSelectPage])

	const handleCreateSubpage = React.useCallback(
		async (e: React.MouseEvent, parentPageId: string) => {
			e.stopPropagation()
			const id = await createPage(client, userId, 'New Page', parentPageId)
			onExpand(parentPageId)
			onSelectPage(id)
		},
		[client, userId, onSelectPage, onExpand]
	)

	const handleDeletePage = React.useCallback(
		async (e: React.MouseEvent, pageId: string) => {
			e.stopPropagation()
			if (!(await dialog.confirm('Delete page', 'Delete this page and all its content?')))
				return
			await deletePage(client, pageId)
		},
		[client, dialog]
	)

	const handlePinToSidebar = React.useCallback(
		async (pageId: string) => {
			await pinToSidebar(client, pageId)
		},
		[client]
	)

	// Close menu on click outside
	React.useEffect(() => {
		if (!menuOpen) return
		function handleClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('click', handleClickOutside, true)
		return () => document.removeEventListener('click', handleClickOutside, true)
	}, [menuOpen])

	const handleCheckConsistency = React.useCallback(async () => {
		setMenuOpen(false)
		const result = await checkConsistency(client)
		const issues = result.orphanPages.length + result.hcMissing.length + result.hcStale.length
		const message = [
			`${result.totalPages} pages total, ${result.rootPages} root pages`,
			result.orphanPages.length > 0
				? `${result.orphanPages.length} orphan pages (not in sidebar)`
				: null,
			result.hcMissing.length > 0
				? `${result.hcMissing.length} pages missing expand indicator`
				: null,
			result.hcStale.length > 0
				? `${result.hcStale.length} pages with stale expand indicator`
				: null
		]
			.filter(Boolean)
			.join('\n\n')

		if (result.needsFix) {
			const shouldFix = await dialog.confirm(
				'Consistency check',
				`${message}\n\nFix ${issues} issues?`
			)
			if (shouldFix) {
				await fixConsistency(client, result)
				await dialog.tell('Consistency check', 'Issues fixed.')
			}
		} else {
			await dialog.tell('Consistency check', `${message}\n\nNo issues found.`)
		}
	}, [client, dialog])

	// DnD callbacks
	const handleDragStart = React.useCallback((_e: React.DragEvent, data: TreeItemDragData) => {
		setDraggedId(data.id)
	}, [])

	const handleDragOver = React.useCallback(
		(targetId: string, _e: React.DragEvent, position: 'before' | 'after' | 'inside') => {
			if (!draggedId || draggedId === targetId) return
			// Prevent dropping into own descendant
			if (position === 'inside' && isAncestor(targetId, draggedId, pages)) return
			setDropTargetId(targetId)
			setDropPosition(position)
		},
		[draggedId, pages]
	)

	const handleDragLeave = React.useCallback(() => {
		setDropTargetId(null)
		setDropPosition(null)
	}, [])

	const handleDrop = React.useCallback(
		(targetId: string, _e: React.DragEvent, position: 'before' | 'after' | 'inside') => {
			if (!draggedId || draggedId === targetId) return
			// Prevent dropping into own descendant
			if (position === 'inside' && isAncestor(targetId, draggedId, pages)) return

			movePage(client, draggedId, targetId, position, pages).catch(console.error)

			// Auto-expand the target if dropping inside
			if (position === 'inside') {
				onExpand(targetId)
			}

			setDraggedId(null)
			setDropTargetId(null)
			setDropPosition(null)
		},
		[draggedId, client, pages, onExpand]
	)

	const handleDragEnd = React.useCallback(() => {
		setDraggedId(null)
		setDropTargetId(null)
		setDropPosition(null)
	}, [])

	function renderPage(page: PageRecord & { id: string }, depth: number) {
		const children = getChildren(page.id)
		const hasChildren = children.length > 0 || pagesWithChildren.has(page.id)
		const isExpanded = expanded.has(page.id)
		const isLoading = loadingChildren.has(page.id)

		return (
			<TreeItem
				key={page.id}
				id={page.id}
				depth={depth}
				expanded={isExpanded}
				selected={page.id === activePageId}
				hasChildren={hasChildren}
				allowDropInside={!readOnly}
				icon={page.icon ? <span>{page.icon}</span> : <IcPage />}
				label={page.title || 'Untitled'}
				isDraggable={!readOnly}
				dragData={{ id: page.id, type: hasChildren ? 'container' : 'object' }}
				dragging={draggedId === page.id}
				dropTarget={dropTargetId === page.id}
				dropPosition={dropTargetId === page.id ? dropPosition : null}
				onSelect={() => onSelectPage(page.id)}
				onToggle={() => onToggleExpand(page.id)}
				onItemDragStart={handleDragStart}
				onItemDragOver={(e, pos) => handleDragOver(page.id, e, pos)}
				onItemDragLeave={handleDragLeave}
				onItemDrop={(e, pos) => handleDrop(page.id, e, pos)}
				onItemDragEnd={handleDragEnd}
				actions={
					!readOnly ? (
						<>
							<button
								className="page-tree-action"
								onClick={(e) => handleCreateSubpage(e, page.id)}
								title="Add subpage"
							>
								<IcAddSubpage />
							</button>
							<button
								className="page-tree-delete"
								onClick={(e) => handleDeletePage(e, page.id)}
								title="Delete page"
							>
								<IcDelete />
							</button>
						</>
					) : undefined
				}
			>
				{isExpanded &&
					(isLoading ? (
						<TreeItem
							key="__loading__"
							id="__loading__"
							depth={depth + 1}
							hasChildren={false}
							icon={<div className="c-spinner xs" />}
							label="Loading..."
						/>
					) : (
						children.map((child) => renderPage(child, depth + 1))
					))}
			</TreeItem>
		)
	}

	// Sorted tags for the tag cloud
	const sortedTags = React.useMemo(
		() => Array.from(tags).sort((a, b) => a.localeCompare(b)),
		[tags]
	)

	return (
		<>
			<div
				className="c-hbox align-items-center g-2 px-3 py-2"
				style={{ borderBottom: '1px solid var(--col-outline)' }}
			>
				<span className="font-semibold text-sm flex-fill">Pages</span>
				{!readOnly && (
					<>
						<Button
							mode="icon"
							size="small"
							onClick={handleCreatePage}
							title="New page"
						>
							<IcPlus />
						</Button>
						<div ref={menuRef} style={{ position: 'relative' }}>
							<Button
								mode="icon"
								size="small"
								onClick={() => setMenuOpen(!menuOpen)}
								title="More actions"
							>
								<IcMore />
							</Button>
							{menuOpen && (
								<div
									className="c-menu"
									style={{ position: 'absolute', top: '100%', right: 0 }}
								>
									<button
										className="c-menu-item"
										onClick={handleCheckConsistency}
									>
										Check consistency
									</button>
								</div>
							)}
						</div>
					</>
				)}
			</div>
			<div className="px-3 py-1">
				<div className="c-input-group">
					<IcSearch className="c-input-icon" />
					<input
						className="c-input"
						type="text"
						placeholder="Search pages..."
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								onSearchChange('')
								e.currentTarget.blur()
							}
						}}
					/>
					{searchQuery && (
						<button
							className="c-input-clear"
							onClick={() => onSearchChange('')}
							title="Clear search"
						>
							<IcClose />
						</button>
					)}
				</div>
			</div>
			<div className="fill overflow-y-auto py-2">
				{isFiltering ? (
					<div className="px-3">
						<div className="c-hbox align-items-center gap-2 mb-2 flex-wrap">
							{activeTag && (
								<>
									<span className="c-tag accent"># {activeTag}</span>
									<button
										className="tag-clear-btn"
										onClick={onClearTag}
										title="Clear tag filter"
									>
										<IcClose />
									</button>
								</>
							)}
							<span className="text-muted text-xs flex-fill text-right">
								{filteredResults.length} result
								{filteredResults.length !== 1 ? 's' : ''}
							</span>
						</div>
						{filteredResults.length === 0 ? (
							<div className="text-muted text-sm">No matching pages.</div>
						) : (
							filteredResults.map((page) => (
								<div
									key={page.id}
									className={`tag-filtered-page${page.id === activePageId ? ' active' : ''}`}
									onClick={() => onSelectPage(page.id)}
								>
									<span className="tag-filtered-page-icon">
										{page.icon ? <span>{page.icon}</span> : <IcPage />}
									</span>
									<span className="tag-filtered-page-title">
										{page.title || 'Untitled'}
									</span>
								</div>
							))
						)}
					</div>
				) : (
					<>
						{orphanPage && (
							<div
								className="px-3 pb-2 mb-1"
								style={{ borderBottom: '1px solid var(--col-outline)' }}
							>
								<div className="text-xs text-muted mb-1">Current Page</div>
								<div
									className={`tag-filtered-page${orphanPage.id === activePageId ? ' active' : ''}`}
									onClick={() => onSelectPage(orphanPage.id)}
								>
									<span className="tag-filtered-page-icon">
										{orphanPage.icon ? (
											<span>{orphanPage.icon}</span>
										) : (
											<IcPage />
										)}
									</span>
									<span className="tag-filtered-page-title flex-fill">
										{orphanPage.title || 'Untitled'}
									</span>
									{!readOnly && (
										<button
											className="page-tree-action"
											onClick={(e) => {
												e.stopPropagation()
												handlePinToSidebar(orphanPage.id)
											}}
											title="Pin to sidebar"
										>
											<IcPin />
										</button>
									)}
								</div>
							</div>
						)}
						{rootPages.length === 0 ? (
							<div className="p-3 text-center text-muted text-sm">
								{readOnly ? 'No pages yet.' : 'No pages yet. Create one!'}
							</div>
						) : (
							<TreeView>{rootPages.map((page) => renderPage(page, 0))}</TreeView>
						)}
					</>
				)}
			</div>
			{sortedTags.length > 0 && (
				<div className="tag-cloud-section">
					<div
						className="c-hbox align-items-center px-3 py-2"
						style={{ borderTop: '1px solid var(--col-outline)' }}
					>
						<span className="font-semibold text-sm flex-fill">Tags</span>
						{activeTag && (
							<button
								className="tag-clear-btn"
								onClick={onClearTag}
								title="Clear filter"
							>
								<IcClose />
							</button>
						)}
					</div>
					<div className="tag-cloud px-3 pb-2">
						{sortedTags.map((tag) => {
							const count = tagCounts.get(tag) ?? 0
							const isActive = tag === activeTag
							return (
								<button
									key={tag}
									className={`c-tag tag-cloud-item${isActive ? ' accent' : ''}`}
									onClick={() => (isActive ? onClearTag() : onSelectTag(tag))}
								>
									# {tag}
									{count > 0 && <span className="c-badge xs">{count}</span>}
								</button>
							)
						})}
					</div>
				</div>
			)}
		</>
	)
}

// vim: ts=4
