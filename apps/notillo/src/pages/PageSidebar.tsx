// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
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

import {
	useDialog,
	Button,
	TreeView,
	TreeItem,
	Menu,
	MenuItem,
	ActionSheet,
	ActionSheetItem,
	type TreeItemDragData
} from '@cloudillo/react'
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
	onResubscribe: (parentId: string) => void
	onImportMarkdown?: (parentPageId: string) => void
}

export function PageSidebar({
	client,
	pages,
	pagesWithChildren,
	expanded,
	loadingChildren,
	orphanPage,
	onExpand,
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
	onResubscribe,
	isFiltering,
	onImportMarkdown
}: PageSidebarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)

	// Page context menu state (right-click / long-press)
	const [ctxMenu, setCtxMenu] = React.useState<{
		x: number
		y: number
		pageId: string
		pageTitle: string
	} | null>(null)
	const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const longPressTriggeredRef = React.useRef(false)

	// Clean up long-press timer on unmount
	React.useEffect(() => {
		return () => {
			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
		}
	}, [])

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
		const id = await createPage(client, userId, t('New Page'), '__root__')
		onSelectPage(id)
	}, [client, userId, onSelectPage, t])

	const handleCreateSubpage = React.useCallback(
		async (e: React.MouseEvent, parentPageId: string) => {
			e.stopPropagation()
			const id = await createPage(client, userId, t('New Page'), parentPageId)
			onExpand(parentPageId)
			onSelectPage(id)
		},
		[client, userId, onSelectPage, onExpand, t]
	)

	const handleDeletePage = React.useCallback(
		async (e: React.MouseEvent, pageId: string) => {
			e.stopPropagation()
			if (
				!(await dialog.confirm(
					t('Delete page'),
					t('Delete this page and all its content?')
				))
			)
				return
			await deletePage(client, pageId)
		},
		[client, dialog, t]
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

	const handlePageContextMenu = React.useCallback(
		(e: React.MouseEvent, pageId: string, pageTitle: string) => {
			if (readOnly || !onImportMarkdown) return
			e.preventDefault()
			e.stopPropagation()
			setCtxMenu({ x: e.clientX, y: e.clientY, pageId, pageTitle })
		},
		[readOnly, onImportMarkdown]
	)

	// Long-press for mobile context menu
	const handleTouchStart = React.useCallback(
		(e: React.TouchEvent, pageId: string, pageTitle: string) => {
			if (readOnly || !onImportMarkdown) return
			const touch = e.touches[0]
			const x = touch?.clientX ?? 0
			const y = touch?.clientY ?? 0
			longPressTriggeredRef.current = false
			longPressTimerRef.current = setTimeout(() => {
				longPressTriggeredRef.current = true
				setCtxMenu({ x, y, pageId, pageTitle })
				longPressTimerRef.current = null
			}, 500)
		},
		[readOnly, onImportMarkdown]
	)

	const handleTouchEnd = React.useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current)
			longPressTimerRef.current = null
		}
	}, [])

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
				t('Consistency check'),
				`${message}\n\n${t('Fix {{count}} issues?', { count: issues })}`
			)
			if (shouldFix) {
				await fixConsistency(client, result)
				await dialog.tell(t('Consistency check'), t('Issues fixed.'))
			}
		} else {
			await dialog.tell(t('Consistency check'), `${message}\n\n${t('No issues found.')}`)
		}
	}, [client, dialog, t])

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

			const target = pages.get(targetId)
			const newParentId = position === 'inside' ? targetId : target?.parentPageId
			const oldParentId = pages.get(draggedId)?.parentPageId

			movePage(client, draggedId, targetId, position, pages)
				.then(() => {
					// Force-refresh subscriptions for affected levels so the UI
					// updates even if the server doesn't notify the new parent's
					// subscription about the moved document.
					if (newParentId && newParentId !== '__root__') onResubscribe(newParentId)
					if (oldParentId && oldParentId !== newParentId && oldParentId !== '__root__')
						onResubscribe(oldParentId)
				})
				.catch(console.error)

			// Auto-expand the target if dropping inside
			if (position === 'inside') {
				onExpand(targetId)
			}

			setDraggedId(null)
			setDropTargetId(null)
			setDropPosition(null)
		},
		[draggedId, client, pages, onExpand, onResubscribe]
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
				label={page.title || t('Untitled')}
				isDraggable={!readOnly}
				dragData={{ id: page.id, type: hasChildren ? 'container' : 'object' }}
				dragging={draggedId === page.id}
				dropTarget={dropTargetId === page.id}
				dropPosition={dropTargetId === page.id ? dropPosition : null}
				onSelect={() => {
					if (longPressTriggeredRef.current) {
						longPressTriggeredRef.current = false
						return
					}
					onSelectPage(page.id)
				}}
				onToggle={() => onToggleExpand(page.id)}
				onContextMenu={(e: React.MouseEvent) =>
					handlePageContextMenu(e, page.id, page.title || t('Untitled'))
				}
				onTouchStart={(e: React.TouchEvent) =>
					handleTouchStart(e, page.id, page.title || t('Untitled'))
				}
				onTouchEnd={handleTouchEnd}
				onTouchMove={handleTouchEnd}
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
								title={t('Add subpage')}
							>
								<IcAddSubpage />
							</button>
							<button
								className="page-tree-delete"
								onClick={(e) => handleDeletePage(e, page.id)}
								title={t('Delete page')}
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
							label={t('Loading...')}
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
				<span className="font-semibold text-sm flex-fill">{t('Pages')}</span>
				{!readOnly && (
					<>
						<Button
							mode="icon"
							size="small"
							onClick={handleCreatePage}
							title={t('New page')}
						>
							<IcPlus />
						</Button>
						<div ref={menuRef} style={{ position: 'relative' }}>
							<Button
								mode="icon"
								size="small"
								onClick={() => setMenuOpen(!menuOpen)}
								title={t('More actions')}
							>
								<IcMore />
							</Button>
							{menuOpen && (
								<div
									className="c-menu"
									style={{ position: 'absolute', top: '100%', right: 0 }}
								>
									{onImportMarkdown && (
										<button
											className="c-menu-item"
											onClick={() => {
												setMenuOpen(false)
												onImportMarkdown('__root__')
											}}
										>
											{t('Import Markdown')}
										</button>
									)}
									<button
										className="c-menu-item"
										onClick={handleCheckConsistency}
									>
										{t('Check consistency')}
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
						placeholder={t('Search pages...')}
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
							title={t('Clear search')}
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
										title={t('Clear tag filter')}
									>
										<IcClose />
									</button>
								</>
							)}
							<span className="text-muted text-xs flex-fill text-right">
								{filteredResults.length === 1
									? t('{{count}} result', { count: filteredResults.length })
									: t('{{count}} results', { count: filteredResults.length })}
							</span>
						</div>
						{filteredResults.length === 0 ? (
							<div className="text-muted text-sm">{t('No matching pages.')}</div>
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
										{page.title || t('Untitled')}
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
								<div className="text-xs text-muted mb-1">{t('Current Page')}</div>
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
										{orphanPage.title || t('Untitled')}
									</span>
									{!readOnly && (
										<button
											className="page-tree-action"
											onClick={(e) => {
												e.stopPropagation()
												handlePinToSidebar(orphanPage.id)
											}}
											title={t('Pin to sidebar')}
										>
											<IcPin />
										</button>
									)}
								</div>
							</div>
						)}
						{rootPages.length === 0 ? (
							<div className="p-3 text-center text-muted text-sm">
								{readOnly ? t('No pages yet.') : t('No pages yet. Create one!')}
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
						<span className="font-semibold text-sm flex-fill">{t('Tags')}</span>
						{activeTag && (
							<button
								className="tag-clear-btn"
								onClick={onClearTag}
								title={t('Clear filter')}
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
			{ctxMenu &&
				(window.innerWidth < 768 ? (
					<ActionSheet
						isOpen={true}
						onClose={() => setCtxMenu(null)}
						title={ctxMenu.pageTitle}
					>
						<ActionSheetItem
							label={t('Import Markdown as child page')}
							onClick={() => {
								onImportMarkdown?.(ctxMenu.pageId)
								setCtxMenu(null)
							}}
						/>
					</ActionSheet>
				) : (
					<Menu
						position={{ x: ctxMenu.x, y: ctxMenu.y }}
						onClose={() => setCtxMenu(null)}
					>
						<MenuItem
							label={t('Import Markdown as child page')}
							onClick={() => {
								onImportMarkdown?.(ctxMenu.pageId)
								setCtxMenu(null)
							}}
						/>
					</Menu>
				))}
		</>
	)
}

// vim: ts=4
