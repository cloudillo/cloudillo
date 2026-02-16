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
	PiXBold as IcClose
} from 'react-icons/pi'

import { useDialog, Button, TreeView, TreeItem, type TreeItemDragData } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { createPage, deletePage, movePage, isAncestor } from '../rtdb/page-ops.js'

interface PageSidebarProps {
	client: RtdbClient
	pages: Map<string, PageRecord & { id: string }>
	activePageId: string | undefined
	onSelectPage: (pageId: string) => void
	userId: string
	readOnly: boolean
	tags: Set<string>
	tagPages: Map<string, Set<string>>
	activeTag: string | null
	onSelectTag: (tag: string) => void
	onClearTag: () => void
}

export function PageSidebar({
	client,
	pages,
	activePageId,
	onSelectPage,
	userId,
	readOnly,
	tags,
	tagPages,
	activeTag,
	onSelectTag,
	onClearTag
}: PageSidebarProps) {
	const dialog = useDialog()
	const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

	// Auto-expand ancestors when active page changes
	React.useEffect(() => {
		if (!activePageId) return
		const ancestors: string[] = []
		let current = pages.get(activePageId)
		while (current?.parentPageId) {
			ancestors.push(current.parentPageId)
			current = pages.get(current.parentPageId)
		}
		if (ancestors.length > 0) {
			setExpanded((prev) => {
				const next = new Set(prev)
				for (const id of ancestors) next.add(id)
				return next
			})
		}
	}, [activePageId, pages])

	const [draggedId, setDraggedId] = React.useState<string | null>(null)
	const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
	const [dropPosition, setDropPosition] = React.useState<'before' | 'after' | 'inside' | null>(
		null
	)

	// Build tree structure from flat pages
	const rootPages = React.useMemo(() => {
		const roots: Array<PageRecord & { id: string }> = []
		for (const page of pages.values()) {
			if (!page.parentPageId) {
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

	const toggleExpand = React.useCallback((pageId: string) => {
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(pageId)) {
				next.delete(pageId)
			} else {
				next.add(pageId)
			}
			return next
		})
	}, [])

	const handleCreatePage = React.useCallback(async () => {
		const id = await createPage(client, userId, 'New Page')
		onSelectPage(id)
	}, [client, userId, onSelectPage])

	const handleCreateSubpage = React.useCallback(
		async (e: React.MouseEvent, parentPageId: string) => {
			e.stopPropagation()
			const id = await createPage(client, userId, 'New Page', parentPageId)
			setExpanded((prev) => new Set(prev).add(parentPageId))
			onSelectPage(id)
		},
		[client, userId, onSelectPage]
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
				setExpanded((prev) => new Set(prev).add(targetId))
			}

			setDraggedId(null)
			setDropTargetId(null)
			setDropPosition(null)
		},
		[draggedId, client, pages]
	)

	const handleDragEnd = React.useCallback(() => {
		setDraggedId(null)
		setDropTargetId(null)
		setDropPosition(null)
	}, [])

	function renderPage(page: PageRecord & { id: string }, depth: number) {
		const children = getChildren(page.id)
		const hasChildren = children.length > 0
		const isExpanded = expanded.has(page.id)

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
				onToggle={() => toggleExpand(page.id)}
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
				{hasChildren && isExpanded && children.map((child) => renderPage(child, depth + 1))}
			</TreeItem>
		)
	}

	// Pages filtered by active tag
	const filteredPages = React.useMemo(() => {
		if (!activeTag) return []
		const pageIds = tagPages.get(activeTag)
		if (!pageIds) return []
		const result: Array<PageRecord & { id: string }> = []
		for (const id of pageIds) {
			const page = pages.get(id)
			if (page) result.push(page)
		}
		return result.sort((a, b) => a.title.localeCompare(b.title))
	}, [activeTag, tagPages, pages])

	// Sorted tags for the tag cloud
	const sortedTags = React.useMemo(
		() => Array.from(tags).sort((a, b) => a.localeCompare(b)),
		[tags]
	)

	return (
		<>
			<div
				className="c-hbox align-items-center px-3 py-2"
				style={{ borderBottom: '1px solid var(--col-outline)' }}
			>
				<span className="font-semibold text-sm flex-fill">Pages</span>
				{!readOnly && (
					<Button
						link
						mode="icon"
						size="small"
						onClick={handleCreatePage}
						title="New page"
					>
						<IcPlus />
					</Button>
				)}
			</div>
			<div className="fill overflow-y-auto py-2">
				{activeTag ? (
					<div className="px-3">
						<div className="c-hbox align-items-center gap-2 mb-2">
							<span className="c-tag accent"># {activeTag}</span>
							<button
								className="tag-clear-btn"
								onClick={onClearTag}
								title="Clear tag filter"
							>
								<IcClose />
							</button>
						</div>
						{filteredPages.length === 0 ? (
							<div className="text-muted text-sm">No pages with this tag.</div>
						) : (
							filteredPages.map((page) => (
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
				) : rootPages.length === 0 ? (
					<div className="p-3 text-center text-muted text-sm">
						{readOnly ? 'No pages yet.' : 'No pages yet. Create one!'}
					</div>
				) : (
					<TreeView>{rootPages.map((page) => renderPage(page, 0))}</TreeView>
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
							const count = tagPages.get(tag)?.size ?? 0
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
