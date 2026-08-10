// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionSheet,
	ActionSheetItem,
	Button,
	LoadingSpinner,
	Menu,
	MenuItem,
	TreeItem,
	type TreeItemDragData,
	TreeView,
	useDialog,
	useIsMobile
} from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiFilePlusBold as IcAddSubpage,
	PiXBold as IcClose,
	PiTrashBold as IcDelete,
	PiDotsThreeVerticalBold as IcMore,
	PiFileBold as IcPage,
	PiPushPinBold as IcPin,
	PiPlusBold as IcPlus
} from 'react-icons/pi'

import {
	buildChildIndex,
	collectDescendants,
	createPage,
	deletePage,
	movePage,
	pinToSidebar,
	planMove
} from '../rtdb/page-ops.js'
import type { PageRecord } from '../rtdb/types.js'
import type { SearchResult } from '../utils/search.js'
import { PageSearchPanel } from './PageSearchPanel.js'
import { useConsistencyCheck } from './useConsistencyCheck.js'

type PageWithId = PageRecord & { id: string }

interface PageSidebarProps {
	client: RtdbClient
	pages: Map<string, PageWithId>
	expanded: Set<string>
	/** The open page when it has no place in the tree (unfiled or orphaned). */
	unfiledPage: PageWithId | null
	onExpand: (pageId: string) => void
	onToggleExpand: (pageId: string) => void
	activePageId: string | undefined
	onSelectPage: (pageId: string) => void
	userId: string
	readOnly: boolean
	tags: Set<string>
	tagCounts: Map<string, number>
	activeTags: Set<string>
	onToggleTag: (tag: string) => void
	onClearTags: () => void
	searchQuery: string
	onSearchChange: (query: string) => void
	filteredResults: SearchResult[]
	/** More matches exist than `filteredResults` carries — the count renders as "N+". */
	resultsTruncated: boolean
	isFiltering: boolean
	/** A page-content search is in flight, so a title-only miss is not yet final. */
	contentSearchPending: boolean
	/** The page-content search failed — content hits are missing, not absent. */
	contentSearchError?: Error
	onRetryContentSearch: () => void
	/** Bumped by the parent (Ctrl+K, `/`) to hand focus to the search box. */
	focusSearchSeq: number
	onSearchActivate: () => void
	/** Most recently visited first. */
	recentPageIds: string[]
	onImportMarkdown?: (parentPageId: string) => void
}

export function PageSidebar({
	client,
	pages,
	expanded,
	unfiledPage,
	onExpand,
	onToggleExpand,
	activePageId,
	onSelectPage,
	userId,
	readOnly,
	tags,
	tagCounts,
	activeTags,
	onToggleTag,
	onClearTags,
	searchQuery,
	onSearchChange,
	filteredResults,
	resultsTruncated,
	isFiltering,
	contentSearchPending,
	contentSearchError,
	onRetryContentSearch,
	focusSearchSeq,
	onSearchActivate,
	recentPageIds,
	onImportMarkdown
}: PageSidebarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const isMobile = useIsMobile()
	const checkPageConsistency = useConsistencyCheck(client)
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
	// Timestamp of the last touchstart anywhere on a page row. Used to
	// suppress the browser's native touch-initiated `contextmenu` event,
	// which on some mobile browsers (Chrome Android on draggable rows in
	// particular) fires on presses that still feel like a quick tap.
	const lastTouchStartRef = React.useRef(0)

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

	const rootPages = React.useMemo(() => {
		const roots: PageWithId[] = []
		for (const page of pages.values()) {
			if (page.parentPageId === '__root__') {
				roots.push(page)
			}
		}
		return roots.sort((a, b) => a.order - b.order)
	}, [pages])

	// The same parent → children index the delete cascade walks, built once here so
	// `handleDeletePage` and `deletePage` don't each rebuild it. Sorted so the tree
	// renders children in their stored order.
	const childIndex = React.useMemo(() => {
		const index = buildChildIndex(pages)
		for (const siblings of index.values()) {
			siblings.sort((a, b) => (pages.get(a)?.order ?? 0) - (pages.get(b)?.order ?? 0))
		}
		return index
	}, [pages])

	// A subtree delete runs page by page and can take a while; the tree it is
	// dismantling must not be edited underneath it, so the other mutating actions
	// go inert until it finishes.
	const [deleting, setDeleting] = React.useState<{
		pageId: string
		done: number
		total: number
	} | null>(null)
	// Set synchronously: `deleting` state is not yet committed when the confirm
	// resolves, so a second click would otherwise pass the guard and start an
	// overlapping cascade.
	const deletingRef = React.useRef(false)
	// Abandoning the sidebar mid-run stops the cascade rather than keeping it
	// committing against a client the user has left behind.
	const deleteAbortRef = React.useRef<AbortController | null>(null)
	React.useEffect(() => () => deleteAbortRef.current?.abort(), [])

	// Shared by all three create paths: a failed write leaves nothing on screen to
	// explain itself, so it has to be told rather than logged.
	const tellCreateFailed = React.useCallback(async () => {
		await dialog.tell(
			t('New page'),
			t('Could not create the page. Check your connection and try again.')
		)
	}, [dialog, t])

	const handleCreatePage = React.useCallback(async () => {
		if (deleting) return
		try {
			const id = await createPage(client, userId, t('New Page'), '__root__')
			onSelectPage(id)
		} catch (err) {
			console.error('[Notillo] Create page failed:', err)
			await tellCreateFailed()
		}
	}, [client, userId, onSelectPage, deleting, t, tellCreateFailed])

	const handleCreateSubpage = React.useCallback(
		async (e: React.MouseEvent, parentPageId: string) => {
			e.stopPropagation()
			if (deleting) return
			try {
				const id = await createPage(client, userId, t('New Page'), parentPageId)
				onExpand(parentPageId)
				onSelectPage(id)
			} catch (err) {
				console.error('[Notillo] Create subpage failed:', err)
				await tellCreateFailed()
			}
		},
		[client, userId, onSelectPage, onExpand, deleting, t, tellCreateFailed]
	)

	const handleDeletePage = React.useCallback(
		async (e: React.MouseEvent, pageId: string) => {
			e.stopPropagation()
			if (deleting || deletingRef.current) return
			deletingRef.current = true
			try {
				const childCount = collectDescendants(pageId, pages, childIndex).length
				const message = !childCount
					? t('Delete this page and all its content?')
					: childCount === 1
						? t('Delete this page, its subpage and all their content?')
						: t('Delete this page, its {{count}} subpages and all their content?', {
								count: childCount
							})
				if (!(await dialog.confirm(t('Delete page'), message))) return
				setDeleting({ pageId, done: 0, total: childCount + 1 })
				const abort = new AbortController()
				deleteAbortRef.current = abort
				try {
					await deletePage(client, pageId, pages, {
						childIndex,
						onProgress: (done, total) => setDeleting({ pageId, done, total }),
						signal: abort.signal
					})
				} catch (err) {
					// An abort is the user's own navigation, not a failure. Checked on
					// the signal rather than on the error's name: `throwIfAborted()`
					// throws a DOM `AbortError` and nothing here should depend on that.
					if (abort.signal.aborted) return
					await dialog.tell(
						t('Delete page'),
						t('Could not delete this page. Some of it may already be gone — try again.')
					)
					console.error('[Notillo] Delete failed:', err)
				} finally {
					deleteAbortRef.current = null
					setDeleting(null)
				}
			} finally {
				deletingRef.current = false
			}
		},
		[client, dialog, pages, childIndex, deleting, t]
	)

	const handlePinToSidebar = React.useCallback(
		async (pageId: string) => {
			if (deleting) return
			try {
				await pinToSidebar(client, pageId)
			} catch (err) {
				console.error('[Notillo] Pin to sidebar failed:', err)
				await dialog.tell(
					t('Pin to sidebar'),
					t('Could not pin this page. Check your connection and try again.')
				)
			}
		},
		[client, deleting, dialog, t]
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
			// Only open from a real mouse right-click. Mobile browsers
			// (Chrome Android especially, and more eagerly on draggable
			// elements) fire `contextmenu` from touch long-press, which
			// races with our own timer and fires on presses that feel
			// like a quick tap. Right-click sets button=2; touch-
			// initiated contextmenu sets button=0. As a second line of
			// defense, suppress any contextmenu fired within 1.5s of
			// the last touchstart on a row — some browsers deliver the
			// touch contextmenu with button=2. Touch long-press is
			// handled by `handleTouchStart`'s timer instead.
			if (e.button !== 2) return
			if (Date.now() - lastTouchStartRef.current < 1500) return
			setCtxMenu({ x: e.clientX, y: e.clientY, pageId, pageTitle })
		},
		[readOnly, onImportMarkdown]
	)

	// Long-press for mobile context menu. Threshold intentionally over
	// half a second so users' "quick taps" don't register as long-press.
	const LONG_PRESS_MS = 700

	const handleTouchStart = React.useCallback(
		(e: React.TouchEvent, pageId: string, pageTitle: string) => {
			if (readOnly || !onImportMarkdown) return
			// TreeItem spreads this onto its outer element and renders its children
			// inside it, so without stopping propagation every ancestor clears the
			// timer armed below and arms its own — the menu would open for the
			// outermost row.
			e.stopPropagation()
			// Defensively clear any timer left over from a previous touch
			// whose touchend/touchmove/touchcancel didn't fire (e.g., the
			// browser hijacked the gesture for a drag). Otherwise the old
			// timer would fire and open the menu for the wrong page.
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current)
				longPressTimerRef.current = null
			}
			lastTouchStartRef.current = Date.now()
			const touch = e.touches[0]
			const x = touch?.clientX ?? 0
			const y = touch?.clientY ?? 0
			longPressTriggeredRef.current = false
			longPressTimerRef.current = setTimeout(() => {
				longPressTriggeredRef.current = true
				setCtxMenu({ x, y, pageId, pageTitle })
				longPressTimerRef.current = null
			}, LONG_PRESS_MS)
		},
		[readOnly, onImportMarkdown]
	)

	const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
		// Same bubbling problem as `handleTouchStart`: ending a touch on a nested row
		// would otherwise cancel every ancestor's timer too.
		e.stopPropagation()
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current)
			longPressTimerRef.current = null
		}
	}, [])

	// DnD callbacks
	const handleDragStart = React.useCallback((_e: React.DragEvent, data: TreeItemDragData) => {
		setDraggedId(data.id)
	}, [])

	const handleDragOver = React.useCallback(
		(targetId: string, _e: React.DragEvent, position: 'before' | 'after' | 'inside') => {
			// `planMove` is the same decision the drop will make, so a move it
			// rejects (anything making the page its own ancestor) never gets a drop
			// indicator painted for it.
			if (!draggedId || !planMove(draggedId, targetId, position, pages)) return
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
			// Bailing out still has to clear the drag state, or the rejected drag
			// stays "in progress" and its row keeps rendering as dragged.
			if (deleting || !draggedId || !planMove(draggedId, targetId, position, pages)) {
				setDraggedId(null)
				setDropTargetId(null)
				setDropPosition(null)
				return
			}

			// A rejected move snaps the row back with nothing to explain it, so say so.
			movePage(client, draggedId, targetId, position, pages).catch((err) => {
				console.error('[Notillo] Move page failed:', err)
				dialog.tell(
					t('Move page'),
					t('Could not move this page. Check your connection and try again.')
				)
			})

			// Auto-expand the target if dropping inside
			if (position === 'inside') {
				onExpand(targetId)
			}

			setDraggedId(null)
			setDropTargetId(null)
			setDropPosition(null)
		},
		[draggedId, client, pages, deleting, onExpand, dialog, t]
	)

	const handleDragEnd = React.useCallback(() => {
		setDraggedId(null)
		setDropTargetId(null)
		setDropPosition(null)
	}, [])

	function renderPage(page: PageWithId, depth: number) {
		const childIds = childIndex.get(page.id) ?? []
		const hasChildren = childIds.length > 0
		const isExpanded = expanded.has(page.id)
		const pageTitle = page.title || t('Untitled')
		const deleteProgress = deleting?.pageId === page.id ? deleting : null

		return (
			<TreeItem
				key={page.id}
				id={page.id}
				aria-busy={deleteProgress ? true : undefined}
				depth={depth}
				expanded={isExpanded}
				selected={page.id === activePageId}
				hasChildren={hasChildren}
				allowDropInside={!readOnly}
				icon={page.icon ? <span>{page.icon}</span> : <IcPage />}
				label={<span title={pageTitle}>{pageTitle}</span>}
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
					handlePageContextMenu(e, page.id, pageTitle)
				}
				onTouchStart={(e: React.TouchEvent) => handleTouchStart(e, page.id, pageTitle)}
				onTouchEnd={handleTouchEnd}
				onTouchMove={handleTouchEnd}
				onTouchCancel={handleTouchEnd}
				onItemDragStart={handleDragStart}
				onItemDragOver={(e, pos) => handleDragOver(page.id, e, pos)}
				onItemDragLeave={handleDragLeave}
				onItemDrop={(e, pos) => handleDrop(page.id, e, pos)}
				onItemDragEnd={handleDragEnd}
				actions={
					deleteProgress ? (
						// The cascade walks the subtree page by page, so beyond a
						// handful the count is what tells the user it is moving
						// rather than stuck.
						<span className="c-hbox align-items-center g-1 text-muted text-xs">
							{/* `aria-label`, not `label`: the latter renders as visible
						    text, which the row has no space for. */}
							<LoadingSpinner size="xs" aria-label={t('Deleting…')} />
							{deleteProgress.total > 20 &&
								`${deleteProgress.done}/${deleteProgress.total}`}
						</span>
					) : !readOnly ? (
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
					childIds.map((childId) => {
						const child = pages.get(childId)
						return child ? renderPage(child, depth + 1) : null
					})}
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
										onClick={() => {
											setMenuOpen(false)
											void checkPageConsistency()
										}}
									>
										{t('Check consistency')}
									</button>
								</div>
							)}
						</div>
					</>
				)}
			</div>
			<PageSearchPanel
				client={client}
				userId={userId}
				readOnly={readOnly}
				pages={pages}
				activePageId={activePageId}
				onSelectPage={onSelectPage}
				searchQuery={searchQuery}
				onSearchChange={onSearchChange}
				filteredResults={filteredResults}
				resultsTruncated={resultsTruncated}
				isFiltering={isFiltering}
				contentSearchPending={contentSearchPending}
				contentSearchError={contentSearchError}
				onRetryContentSearch={onRetryContentSearch}
				focusSearchSeq={focusSearchSeq}
				onSearchActivate={onSearchActivate}
				recentPageIds={recentPageIds}
				tags={tags}
				tagCounts={tagCounts}
				activeTags={activeTags}
				onToggleTag={onToggleTag}
				onClearTags={onClearTags}
				onCreateFailed={tellCreateFailed}
				renderTree={() => (
					<>
						{unfiledPage && (
							<div
								className="px-3 pb-2 mb-1"
								style={{ borderBottom: '1px solid var(--col-outline)' }}
							>
								<div className="text-xs text-muted mb-1">{t('Current Page')}</div>
								<div
									className={`tag-filtered-page${unfiledPage.id === activePageId ? ' active' : ''}`}
									title={unfiledPage.title || t('Untitled')}
									onClick={() => onSelectPage(unfiledPage.id)}
								>
									<span className="tag-filtered-page-icon">
										{unfiledPage.icon ? (
											<span>{unfiledPage.icon}</span>
										) : (
											<IcPage />
										)}
									</span>
									<span className="tag-filtered-page-title flex-fill">
										{unfiledPage.title || t('Untitled')}
									</span>
									{!readOnly && (
										<button
											className="page-tree-action"
											onClick={(e) => {
												e.stopPropagation()
												handlePinToSidebar(unfiledPage.id)
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
							<TreeView className="page-tree">
								{rootPages.map((page) => renderPage(page, 0))}
							</TreeView>
						)}
					</>
				)}
			/>
			{sortedTags.length > 0 && (
				<div className="tag-cloud-section">
					<div
						className="c-hbox align-items-center px-3 py-2"
						style={{ borderTop: '1px solid var(--col-outline)' }}
					>
						<span className="font-semibold text-sm flex-fill">{t('Tags')}</span>
						{activeTags.size > 0 && (
							<button
								className="tag-clear-btn"
								type="button"
								onClick={onClearTags}
								title={t('Clear filter')}
							>
								<IcClose />
							</button>
						)}
					</div>
					<div className="tag-cloud px-3 pb-2">
						{sortedTags.map((tag) => {
							const count = tagCounts.get(tag) ?? 0
							const isActive = activeTags.has(tag)
							return (
								<button
									key={tag}
									type="button"
									aria-pressed={isActive}
									className={`c-tag tag-cloud-item${isActive ? ' accent' : ''}`}
									onClick={() => onToggleTag(tag)}
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
				(isMobile ? (
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
