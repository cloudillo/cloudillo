// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { dedupePresenceUsers, type PresenceEntry } from '@cloudillo/core'
import {
	ActionSheet,
	ActionSheetItem,
	AvatarGroup,
	Button,
	LoadingSpinner,
	Menu,
	MenuItem,
	Modal,
	PresenceAvatar,
	TreeItem,
	type TreeItemDragData,
	TreeView,
	useDialog,
	useIsMobile,
	usePresence
} from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuHouse as IcHome } from 'react-icons/lu'
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
import { ROOT_PARENT } from '../rtdb/types.js'
import { childKindFor } from '../utils/archetype.js'
import type { SearchResult } from '../utils/search.js'
import { PageSearchPanel } from './PageSearchPanel.js'
import { useConsistencyCheck } from './useConsistencyCheck.js'

type PageWithId = PageRecord & { id: string }

/** Faces shown on a page row before the group collapses into a `+N` chip. */
const PAGE_PRESENCE_MAX = 3

/**
 * Who else is on this page, as a stack of faces on its sidebar row.
 *
 * This is what a document-wide roster buys over a per-page one: you can see that
 * someone is working on a page you are not looking at. The faces are the same
 * `PresenceAvatar` the docbar uses, only smaller (see `.page-tree-presence` in
 * style.css): a picture where one resolved, otherwise a monogram on the same
 * identity hue, with a dashed ring for a guest, who has no verified identity
 * behind the face.
 */
function PagePresence({ users, guestLabel }: { users: PresenceEntry[]; guestLabel: string }) {
	const label = users.map((user) => user.name || user.idTag || guestLabel).join(', ')

	return (
		<AvatarGroup
			className="page-tree-presence"
			max={PAGE_PRESENCE_MAX}
			size="xs"
			title={label}
			aria-label={label}
		>
			{users.map((user) => (
				<PresenceAvatar
					key={user.idTag ?? user.connId}
					user={user}
					size="xs"
					guestLabel={guestLabel}
				/>
			))}
		</AvatarGroup>
	)
}

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
	/**
	 * The document is published as a website, so it has a home page, addresses and
	 * page types. With it off the sidebar is exactly what it has always been.
	 */
	siteMode: boolean
	/** The page served at the mount root, when the document names one. */
	homePageId?: string
	/**
	 * Promote a page to home, or clear it — reparenting and confirmation included.
	 *
	 * The whole act lives in `hooks/useHomePage.ts`, because the page settings pane
	 * offers the same two actions and two copies would be two confirm dialogs saying
	 * different things.
	 */
	onSetHome: (pageId: string, opts?: { justCreated?: boolean }) => Promise<void>
	onClearHome: () => Promise<void>
	/** A home-page write is in flight, so the home actions are inert. */
	homeBusy: boolean
	/**
	 * Bumped by the parent (the publish dialog's "Choose a home page") to open the
	 * home picker. Ignored when site mode is off.
	 */
	homePickerSeq?: number
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
	onImportMarkdown,
	siteMode,
	homePageId,
	onSetHome,
	onClearHome,
	homeBusy,
	homePickerSeq
}: PageSidebarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const isMobile = useIsMobile()
	const checkPageConsistency = useConsistencyCheck(client)
	const { entries: presenceEntries } = usePresence()
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
			if (page.parentPageId === ROOT_PARENT) {
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

	// The home page as the sidebar shows it. A `homePageId` naming a page that no
	// longer exists reads as no home page at all — which is what `resolveTree` makes
	// of it too, so the sidebar and the container cannot disagree.
	const homePage = siteMode && homePageId ? (pages.get(homePageId) ?? null) : null

	// The top level of the site: pages filed at the root, plus any still stored under
	// the home page. The same fold `childrenOf` applies when resolving the tree, so
	// "top level" means one thing in the sidebar and in the container both.
	const topLevelPages = React.useMemo(() => {
		if (!homePage) return rootPages
		const top: PageWithId[] = []
		for (const page of pages.values()) {
			if (page.id === homePage.id) continue
			// Deliberately *not* `isTopLevel`: an unfiled page (`pp: null`) is hidden
			// from the tree by `removeFromSidebar` and shown in its own slot below.
			// Publish lifts such a page to the top level, the sidebar does not.
			if (page.parentPageId === ROOT_PARENT || page.parentPageId === homePage.id) {
				top.push(page)
			}
		}
		return top.sort((a, b) => a.order - b.order)
	}, [pages, rootPages, homePage])

	// What the *tree* renders, as against what the delete cascade walks. The home
	// page's rendered children are the top-level pages; its stored children are
	// whatever `pp` says, and deleting it must not cascade into the whole document.
	const treeChildIndex = React.useMemo(() => {
		if (!homePage) return childIndex
		const index = new Map(childIndex)
		index.set(
			homePage.id,
			topLevelPages.map((page) => page.id)
		)
		return index
	}, [childIndex, homePage, topLevelPages])

	// Everyone else's page, off the document-wide roster. Grouped from `entries`
	// (one per connection) and deduplicated per page afterwards, so two tabs of one
	// person on one page show one face — the platform-wide rule, and the same
	// ordering the DocBar uses.
	const presenceByPage = React.useMemo(() => {
		const byPage = new Map<string, PresenceEntry[]>()
		for (const entry of presenceEntries) {
			// `state` is peer-published and unvalidated.
			const page = entry.state?.page
			if (entry.self || typeof page !== 'string' || !page) continue
			const list = byPage.get(page)
			if (list) list.push(entry)
			else byPage.set(page, [entry])
		}
		for (const [page, list] of byPage) byPage.set(page, dedupePresenceUsers(list))
		return byPage
	}, [presenceEntries])

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
			const id = await createPage(client, userId, t('New Page'), ROOT_PARENT)
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
				// The child's archetype is what the parent says its children are, so
				// adding a post under a blog page is one step rather than two.
				const id = await createPage(
					client,
					userId,
					t('New Page'),
					parentPageId,
					childKindFor(pages.get(parentPageId))
				)
				onExpand(parentPageId)
				onSelectPage(id)
			} catch (err) {
				console.error('[Notillo] Create subpage failed:', err)
				await tellCreateFailed()
			}
		},
		[client, userId, pages, onSelectPage, onExpand, deleting, t, tellCreateFailed]
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

	// The home page's own local UI state. `homeExpanded` is not part of the parent's
	// `expanded` set on purpose: the home row is the root of the whole tree, so it
	// starts open, and the shared set means the opposite — absent is collapsed.
	const [homeExpanded, setHomeExpanded] = React.useState(true)
	const [homePickerOpen, setHomePickerOpen] = React.useState(false)
	const [creatingHome, setCreatingHome] = React.useState(false)

	// The publish dialog's "Choose a home page" reaches the picker through this.
	// Falsy — which the parent's initial 0 is — never opens it, so mounting the
	// sidebar does not put a dialog on screen.
	React.useEffect(() => {
		if (!homePickerSeq || !siteMode) return
		setHomePickerOpen(true)
	}, [homePickerSeq, siteMode])

	const handleCreateHomePage = React.useCallback(async () => {
		if (deleting || homeBusy || creatingHome) return
		setHomePickerOpen(false)
		setCreatingHome(true)
		try {
			const id = await createPage(client, userId, t('Home'), ROOT_PARENT)
			// A page created a moment ago has no children and is not live, so this
			// promotes it without a confirm dialog nobody needs to read. The flag is
			// what gets it past `setHome`'s "is this page real" guard: the page map is
			// the last snapshot, which cannot contain a page this new.
			await onSetHome(id, { justCreated: true })
			onSelectPage(id)
		} catch (err) {
			console.error('[Notillo] Create home page failed:', err)
			await tellCreateFailed()
		} finally {
			setCreatingHome(false)
		}
	}, [
		client,
		userId,
		deleting,
		homeBusy,
		creatingHome,
		onSetHome,
		onSelectPage,
		tellCreateFailed,
		t
	])

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

	// The menu carries the home actions as well as the import, so site mode alone is
	// enough to make a row worth opening one on.
	const hasRowMenu = !readOnly && (!!onImportMarkdown || siteMode)

	const handlePageContextMenu = React.useCallback(
		(e: React.MouseEvent, pageId: string, pageTitle: string) => {
			if (!hasRowMenu) return
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
		[hasRowMenu]
	)

	// Long-press for mobile context menu. Threshold intentionally over
	// half a second so users' "quick taps" don't register as long-press.
	const LONG_PRESS_MS = 700

	const handleTouchStart = React.useCallback(
		(e: React.TouchEvent, pageId: string, pageTitle: string) => {
			if (!hasRowMenu) return
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
		[hasRowMenu]
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

	/**
	 * One row of the tree. `opts` is what the home row needs and no ordinary page
	 * does — see `renderHomeRow`, which is this function with four things swapped.
	 */
	interface PageRowOptions {
		icon?: React.ReactNode
		/** A chip after the title. */
		badge?: React.ReactNode
		/** The home row cannot be dragged: there is nothing above it to drag to. */
		draggable?: boolean
		/** The `+` button. Default: add a subpage of this page. */
		add?: { title: string; onClick: (e: React.MouseEvent) => void }
		/** Expansion state and children, when they are not the tree's own. */
		expanded?: boolean
		onToggle?: () => void
		childRows?: React.ReactNode
		hasChildren?: boolean
	}

	// `seen` is the ancestor chain, not a global visited set: the same page may
	// legitimately appear under two parents — the home row renders the top level as
	// its children — but never under itself. A concurrent re-parent or any
	// out-of-band `pp` write can close the loop, and an unguarded walk then recurses
	// until the stack goes. `resolveTree` (publish/tree.ts) and `buildTree`
	// (render/serializer.ts) guard the same way.
	function renderPage(
		page: PageWithId,
		depth: number,
		opts: PageRowOptions = {},
		seen: ReadonlySet<string> = new Set()
	) {
		const childIds = treeChildIndex.get(page.id) ?? []
		const hasChildren = opts.hasChildren ?? childIds.length > 0
		const isExpanded = opts.expanded ?? expanded.has(page.id)
		const pageTitle = page.title || t('Untitled')
		const deleteProgress = deleting?.pageId === page.id ? deleting : null
		const pageUsers = presenceByPage.get(page.id)
		const draggable = !readOnly && (opts.draggable ?? true)

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
				icon={opts.icon ?? (page.icon ? <span>{page.icon}</span> : <IcPage />)}
				label={
					// The faces go in the label rather than in `actions`, which only
					// becomes visible on hover — "someone is on this page" is exactly
					// the thing you need to see without pointing at the row. The clamp
					// lives on the title span, not on `.c-tree-item-label`: clipping
					// the label would cut the outline that draws each face's identity
					// ring.
					<>
						<span className="page-tree-title" title={pageTitle}>
							{pageTitle}
						</span>
						{opts.badge}
						{pageUsers && <PagePresence users={pageUsers} guestLabel={t('Guest')} />}
					</>
				}
				isDraggable={draggable}
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
				onToggle={opts.onToggle ?? (() => onToggleExpand(page.id))}
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
								onClick={
									opts.add?.onClick ?? ((e) => handleCreateSubpage(e, page.id))
								}
								title={opts.add?.title ?? t('Add subpage')}
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
					(opts.childRows ??
						childIds.map((childId) => {
							if (seen.has(childId)) return null
							const child = pages.get(childId)
							return child
								? renderPage(child, depth + 1, {}, new Set(seen).add(page.id))
								: null
						}))}
			</TreeItem>
		)
	}

	/**
	 * The home page, pinned above the tree with the top-level pages as its children.
	 *
	 * An ordinary row with four things swapped: the house icon and a `/` chip instead
	 * of a slug, no dragging (there is nothing above it to drag to), a `+` that adds a
	 * top-level page rather than one of its own subpages, and the top level as its
	 * children. Everything else — the long-press guard, the touch and drop handlers,
	 * the delete progress — is `renderPage`'s, once.
	 */
	function renderHomeRow(home: PageWithId) {
		return renderPage(home, 0, {
			icon: <IcHome />,
			badge: (
				<span className="c-badge xs" title={t('Served at your site’s root')}>
					/
				</span>
			),
			draggable: false,
			add: { title: t('New page'), onClick: handleCreatePage },
			hasChildren: topLevelPages.length > 0,
			expanded: homeExpanded,
			onToggle: () => setHomeExpanded((open) => !open),
			childRows: topLevelPages.map((page) => renderPage(page, 1, {}, new Set([home.id])))
		})
	}

	/** The home slot with nothing in it — site mode is on but no page claims `/`. */
	function renderHomeEmptyRow() {
		return (
			<div className="page-tree-home-empty c-vbox g-1 mx-2 mb-2 p-2">
				<div className="c-hbox align-items-center g-2">
					<IcHome />
					<span className="font-semibold text-sm flex-fill">{t('Home')}</span>
				</div>
				<div className="text-xs text-muted">
					{t('Not set — visitors to / see nothing yet.')}
				</div>
				{!readOnly && (
					<Button size="small" onClick={() => setHomePickerOpen(true)}>
						{t('Choose a page…')}
					</Button>
				)}
			</div>
		)
	}

	// Sorted tags for the tag cloud
	const sortedTags = React.useMemo(
		() => Array.from(tags).sort((a, b) => a.localeCompare(b)),
		[tags]
	)

	// The one home action the open row menu offers, if any. A subpage is not on the
	// list: it would have to be moved to the top level first, and the drag that does
	// that is the same gesture either way.
	const homeAction = React.useMemo(():
		| { label: string; run: () => Promise<void> }
		| undefined => {
		if (!siteMode || readOnly || !ctxMenu) return undefined
		const { pageId } = ctxMenu
		if (homePage && pageId === homePage.id) {
			return { label: t('Remove as home page'), run: onClearHome }
		}
		if (topLevelPages.some((page) => page.id === pageId)) {
			return { label: t('Set as home page'), run: () => onSetHome(pageId) }
		}
		return undefined
	}, [siteMode, readOnly, ctxMenu, homePage, topLevelPages, onClearHome, onSetHome, t])

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
												onImportMarkdown(ROOT_PARENT)
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
						{siteMode && !homePage && renderHomeEmptyRow()}
						{!homePage && topLevelPages.length === 0 ? (
							<div className="p-3 text-center text-muted text-sm">
								{readOnly ? t('No pages yet.') : t('No pages yet. Create one!')}
							</div>
						) : (
							<TreeView className="page-tree">
								{homePage
									? renderHomeRow(homePage)
									: topLevelPages.map((page) => renderPage(page, 0))}
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
				(() => {
					// Same items either way — only the chrome around them differs, so
					// the item list is built once and the row component picked.
					const Item = isMobile ? ActionSheetItem : MenuItem
					const items = [
						onImportMarkdown && {
							label: t('Import Markdown as child page'),
							run: () => onImportMarkdown(ctxMenu.pageId)
						},
						homeAction && { label: homeAction.label, run: homeAction.run }
					].filter((item) => !!item)
					const rows = items.map((item) => (
						<Item
							key={item.label}
							label={item.label}
							onClick={() => {
								const { run } = item
								setCtxMenu(null)
								void run()
							}}
						/>
					))
					return isMobile ? (
						<ActionSheet
							isOpen={true}
							onClose={() => setCtxMenu(null)}
							title={ctxMenu.pageTitle}
						>
							{rows}
						</ActionSheet>
					) : (
						<Menu
							position={{ x: ctxMenu.x, y: ctxMenu.y }}
							onClose={() => setCtxMenu(null)}
						>
							{rows}
						</Menu>
					)
				})()}
			{homePickerOpen && (
				<Modal open onClose={() => setHomePickerOpen(false)} className="p-0">
					<div
						className="c-dialog c-panel emph p-4 c-vbox g-3"
						style={{ maxWidth: '24rem', width: '90vw' }}
					>
						<h2 className="m-0">{t('Choose a home page')}</h2>
						<p className="c-hint m-0">
							{t(
								'It is served at your site’s root, and your other top-level pages become its subpages.'
							)}
						</p>
						{topLevelPages.length > 0 && (
							<div
								className="c-vbox g-1 overflow-y-auto"
								style={{ maxHeight: '40vh' }}
							>
								{topLevelPages.map((page) => (
									<Button
										key={page.id}
										kind="link"
										className="justify-content-start"
										disabled={homeBusy || creatingHome}
										onClick={() => {
											setHomePickerOpen(false)
											void onSetHome(page.id)
										}}
									>
										{page.icon ? <span>{page.icon}</span> : <IcPage />}
										<span className="flex-fill">
											{page.title || t('Untitled')}
										</span>
									</Button>
								))}
							</div>
						)}
						<div className="c-hbox justify-content-end g-2">
							<Button onClick={() => setHomePickerOpen(false)}>{t('Cancel')}</Button>
							<Button
								variant="primary"
								disabled={homeBusy || creatingHome}
								onClick={handleCreateHomePage}
							>
								{t('Create a home page')}
							</Button>
						</div>
					</div>
				</Modal>
			)}
		</>
	)
}

// vim: ts=4
