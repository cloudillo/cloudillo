// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus, getDocWsUrl, getFileUrl } from '@cloudillo/core'
import type { CommentThread } from '@cloudillo/react'
import {
	Button,
	DialogContainer,
	EmptyState,
	Fcd,
	LoadingSpinner,
	Panel,
	useComments,
	useDialog,
	useIsMobile
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPanelLeft as IcSidebar } from 'react-icons/lu'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/react/components.css'
import './i18n.js'
import './style.css'

import {
	CommentPanel,
	CommentPopup,
	type ThreadListHandle,
	ThreadListHeader
} from './comments/index.js'
import { NotilloEditor as NotilloEditorComponent } from './editor/NotilloEditor.js'
import type { NotilloEditor } from './editor/schema.js'
import { exportDocx, exportMarkdown, exportOdt, exportPdf, importMarkdown } from './export/index.js'
import { useActivePageGuard } from './hooks/useActivePageGuard.js'
import { useAllPages } from './hooks/useAllPages.js'
import { useBlockContextMenu } from './hooks/useBlockContextMenu.js'
import { useCommentBlockButton } from './hooks/useCommentBlockButton.js'
import { useCommentIndicators } from './hooks/useCommentIndicators.js'
import { useContentSearch } from './hooks/useContentSearch.js'
import { useNotillo } from './hooks/useNotillo.js'
import { usePageBlocks } from './hooks/usePageBlocks.js'
import { useTags } from './hooks/useTags.js'
import { PageHeader } from './pages/PageHeader.js'
import { PageSidebar } from './pages/PageSidebar.js'
import { createPage, getAncestorIds } from './rtdb/page-ops.js'
import { searchPages } from './utils/search.js'

/** How many visited pages the sidebar offers with an empty query. */
const RECENT_PAGE_LIMIT = 8

/** Cap on rendered search rows — each one costs an ancestor walk for its breadcrumb. */
const MAX_SIDEBAR_RESULTS = 50

export function NotilloApp() {
	const { t } = useTranslation()
	const notillo = useNotillo()
	const dialog = useDialog()
	const canWrite = notillo.access === 'write'
	const canComment = notillo.access !== 'read'
	// One live map of every page feeds the tree, wiki-links, search and the `@`
	// picker. `expanded` is pure local UI state on top of it.
	const {
		allPages: pages,
		ready: pagesReady,
		error: pagesError,
		retry: retryPages
	} = useAllPages(notillo.client)
	const { tags, tagCounts } = useTags(pages)
	const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
	const [activePageId, setActivePageId] = React.useState<string | undefined>()
	const [recentPageIds, setRecentPageIds] = React.useState<string[]>([])
	const [showFilter, setShowFilter] = React.useState(false)
	const [showComments, setShowComments] = React.useState(false)
	const [threadCount, setThreadCount] = React.useState(0)
	const [pendingCommentAnchor, setPendingCommentAnchor] = React.useState<string | undefined>()
	const [pendingCommentOffset, setPendingCommentOffset] = React.useState<number | undefined>()
	const [popupBlockId, setPopupBlockId] = React.useState<string | null>(null)
	const [pageThreads, setPageThreads] = React.useState<CommentThread[]>([])
	const [activeTags, setActiveTags] = React.useState<Set<string>>(new Set())
	const [searchQuery, setSearchQuery] = React.useState('')

	// Content search only talks to the server once someone actually searches, so
	// opening a document costs nothing extra. Focusing the search box arms it, so
	// the first committed query does not also pay for the setup.
	const [contentSearchEnabled, setContentSearchEnabled] = React.useState(false)
	const enableContentSearch = React.useCallback(() => setContentSearchEnabled(true), [])
	React.useEffect(() => {
		if (searchQuery) setContentSearchEnabled(true)
	}, [searchQuery])
	const {
		hits: contentHits,
		ready: contentReady,
		truncated: contentTruncated,
		error: contentError,
		retry: retryContentSearch
	} = useContentSearch({
		fileId: notillo.fileId,
		ownerTag: notillo.ownerTag,
		idTag: notillo.idTag,
		query: searchQuery,
		tags: activeTags,
		enabled: contentSearchEnabled
	})

	// `notillo.idTag` is undefined on the first render, so this must not throw. `useComments`
	// connects lazily and refuses an empty serverUrl outright, and it has `serverUrl` in its
	// effect deps, so the client is built once - with the real URL - when the identity arrives.
	const commentsServerUrl = getDocWsUrl(notillo.ownerTag, notillo.idTag) ?? ''

	const getCommentToken = React.useCallback(() => getAppBus().accessToken, [])
	const refreshCommentToken = React.useCallback(() => getAppBus().refreshToken(), [])

	const comments = useComments({
		fileId: notillo.fileId || '',
		serverUrl: commentsServerUrl,
		getToken: getCommentToken,
		refreshToken: refreshCommentToken,
		idTag: notillo.idTag,
		displayName: getAppBus().displayName,
		access: notillo.access || 'read'
	})
	const { subscribeThreads } = comments

	// Subscribe to page threads at app level for badge indicators
	React.useEffect(() => {
		if (!canComment || !activePageId) {
			setPageThreads([])
			setThreadCount(0)
			return
		}
		const scope = `p:${activePageId}`
		const unsubscribe = comments.subscribeThreads(scope, (threads) => {
			setPageThreads(threads)
			setThreadCount(threads.filter((t) => t.status === 'open').length)
		})
		return unsubscribe
	}, [canComment, subscribeThreads, activePageId])

	// Comment badge indicators on editor blocks
	const [focusBlockId, setFocusBlockId] = React.useState<string | undefined>()
	const isMobile = useIsMobile()
	const handleBadgeClick = React.useCallback(
		(blockId: string) => {
			if (isMobile) {
				setPopupBlockId(blockId)
			} else {
				setFocusBlockId(blockId)
				setShowComments(true)
			}
		},
		[isMobile]
	)
	const { blockThreadMap } = useCommentIndicators(pageThreads, handleBadgeClick)

	const editorRef = React.useRef<NotilloEditor | null>(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const childImportInputRef = React.useRef<HTMLInputElement>(null)
	const commentPanelRef = React.useRef<ThreadListHandle | null>(null)
	const [pendingImport, setPendingImport] = React.useState<
		{ markdown: string; pageId: string; source: 'shell' | 'local' } | undefined
	>()

	// Store raw import payload in state so the processing effect re-runs
	// whenever a new payload arrives (even after client is already ready).
	const [importPayload, setImportPayload] = React.useState<{
		markdown: string
		fileName: string
	} | null>(null)

	// Register import handler early (no dependency on client)
	React.useEffect(() => {
		const bus = getAppBus()
		return bus.onImportData(async (payload) => {
			if (payload.sourceMimeType === 'text/markdown') {
				const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0))
				const markdown = new TextDecoder().decode(bytes)
				setImportPayload({ markdown, fileName: payload.fileName })
			} else {
				bus.notifyImportComplete(
					false,
					`Unsupported import type: ${payload.sourceMimeType}`
				)
			}
		})
	}, [])

	// Guard against double importMarkdown calls from handleEditorReady re-firing
	const importRunningRef = React.useRef(false)

	// Process import payload once client is ready
	React.useEffect(() => {
		if (!notillo.client || !notillo.idTag || !importPayload) return
		const payload = importPayload

		let cancelled = false
		const bus = getAppBus()
		;(async () => {
			try {
				const title = payload.fileName.replace(/\.[^.]+$/, '') || 'Imported'
				const pageId = await createPage(notillo.client!, notillo.idTag!, title, '__root__')
				if (cancelled) return
				setPendingImport({ markdown: payload.markdown, pageId, source: 'shell' })
				setActivePageId(pageId)
				setImportPayload(null)
			} catch (err) {
				if (cancelled) return
				console.error('[Notillo] Markdown import failed:', err)
				bus.notifyImportComplete(
					false,
					err instanceof Error ? err.message : 'Import failed'
				)
				setImportPayload(null)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [notillo.client, notillo.idTag, importPayload])

	// Reset editor ref when active page changes
	React.useEffect(() => {
		editorRef.current = null
		importRunningRef.current = false
	}, [activePageId])

	const handleEditorReady = React.useCallback(
		(editor: NotilloEditor) => {
			editorRef.current = editor
			if (
				pendingImport &&
				activePageId === pendingImport.pageId &&
				!importRunningRef.current
			) {
				importRunningRef.current = true
				importMarkdown(editor, pendingImport.markdown, pages)
					.then(() => {
						importRunningRef.current = false
						if (pendingImport.source === 'shell') {
							getAppBus().notifyImportComplete(true)
						}
						setPendingImport(undefined)
					})
					.catch((err) => {
						importRunningRef.current = false
						console.error('[Notillo] Deferred import failed:', err)
						if (pendingImport.source === 'shell') {
							getAppBus().notifyImportComplete(
								false,
								err instanceof Error ? err.message : 'Import failed'
							)
						}
						setPendingImport(undefined)
					})
			}
		},
		[pendingImport, activePageId, pages]
	)

	const resolveFileUrl = React.useCallback(
		async (url: string): Promise<string | Blob> => {
			if (!notillo.ownerTag || !url.startsWith('cl-file:')) return url

			const rest = url.slice(8)
			const colonIdx = rest.indexOf(':')

			let resolvedUrl: string
			const tokenOpt = notillo.token ? { token: notillo.token } : undefined
			if (colonIdx !== -1) {
				const tag = rest.slice(0, colonIdx)
				const fileId = rest.slice(colonIdx + 1)

				if (tag === 'img')
					resolvedUrl = getFileUrl(notillo.ownerTag, fileId, 'vis.hd', tokenOpt)
				else if (tag === 'vid')
					resolvedUrl = getFileUrl(notillo.ownerTag, fileId, 'vid.hd', tokenOpt)
				else resolvedUrl = getFileUrl(notillo.ownerTag, fileId, undefined, tokenOpt)
			} else {
				resolvedUrl = getFileUrl(notillo.ownerTag, rest, 'vis.hd', tokenOpt)
			}

			// Fetch and convert unsupported formats to PNG
			const resp = await fetch(resolvedUrl)
			const blob = await resp.blob()

			if (blob.type === 'image/png' || blob.type === 'image/jpeg') return blob

			// Convert SVG/WebP/AVIF → PNG via Canvas
			const blobUrl = URL.createObjectURL(blob)
			try {
				const img = new Image()
				img.crossOrigin = 'anonymous'
				await new Promise<void>((resolve, reject) => {
					img.onload = () => resolve()
					img.onerror = () => reject(new Error('Failed to load image for conversion'))
					img.src = blobUrl
				})

				// SVGs may report tiny default dimensions — scale up for quality
				const MIN_WIDTH = 1024
				let w = img.naturalWidth
				let h = img.naturalHeight
				if (w === 0 || h === 0) {
					w = 1920
					h = 1080
				} else if (w < MIN_WIDTH) {
					const scale = 1920 / w
					w = 1920
					h = Math.round(h * scale)
				}

				const canvas = document.createElement('canvas')
				canvas.width = w
				canvas.height = h
				const ctx = canvas.getContext('2d')!
				ctx.drawImage(img, 0, 0, w, h)
				return await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(
						(b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
						'image/png'
					)
				})
			} finally {
				URL.revokeObjectURL(blobUrl)
			}
		},
		[notillo.ownerTag, notillo.token]
	)

	// Create indexes for queries (only writers — indexes persist once created)
	React.useEffect(() => {
		if (!notillo.client || !canWrite) return
		notillo.client.createIndex('p', 'pp').catch(console.error)
		notillo.client.createIndex('p', 'tg').catch(console.error)
		notillo.client.createIndex('b', 'p').catch(console.error)
	}, [notillo.client, canWrite])

	const expand = React.useCallback((pageId: string) => {
		setExpanded((prev) => {
			if (prev.has(pageId)) return prev
			const next = new Set(prev)
			next.add(pageId)
			return next
		})
	}, [])

	const toggleExpand = React.useCallback((pageId: string) => {
		setExpanded((prev) => {
			const next = new Set(prev)
			if (!next.delete(pageId)) next.add(pageId)
			return next
		})
	}, [])

	// Opening a page reveals it: every ancestor is expanded so the sidebar shows
	// where it lives. Filled in a layout effect rather than during render, which is
	// not safe under concurrent rendering; its only reader is an event handler,
	// which cannot run before the commit anyway.
	const pagesRef = React.useRef(pages)
	React.useLayoutEffect(() => {
		pagesRef.current = pages
	}, [pages])

	const handleSelectPage = React.useCallback((pageId: string) => {
		setActivePageId(pageId)
		setShowFilter(false)
		setRecentPageIds((prev) =>
			[pageId, ...prev.filter((id) => id !== pageId)].slice(0, RECENT_PAGE_LIMIT)
		)

		const { ancestorIds } = getAncestorIds(pageId, pagesRef.current)
		if (!ancestorIds.length) return
		setExpanded((prev) => {
			const next = new Set(prev)
			let changed = false
			for (const id of ancestorIds) {
				if (!next.has(id)) {
					next.add(id)
					changed = true
				}
			}
			return changed ? next : prev
		})
	}, [])

	// A page can vanish under us — deleted here, or by a collaborator. Clearing the
	// selection lets the auto-select effect below pick a new page.
	const clearActivePage = React.useCallback(() => setActivePageId(undefined), [])
	useActivePageGuard(pages, pagesReady, activePageId, clearActivePage)

	// Auto-select initial page: deep link (nav param) or first root page
	React.useEffect(() => {
		if (activePageId || !pagesReady || pages.size === 0) return

		// Deep link: the nav param is a page id, or failing that an exact title.
		if (notillo.navParam) {
			if (pages.has(notillo.navParam)) {
				handleSelectPage(notillo.navParam)
				return
			}
			for (const page of pages.values()) {
				if (page.title === notillo.navParam) {
					handleSelectPage(page.id)
					return
				}
			}
		}

		let firstPage: { id: string; order: number } | undefined
		for (const page of pages.values()) {
			if (page.parentPageId === '__root__' && (!firstPage || page.order < firstPage.order)) {
				firstPage = { id: page.id, order: page.order }
			}
		}
		if (firstPage) handleSelectPage(firstPage.id)
	}, [pages, pagesReady, activePageId, notillo.navParam, handleSelectPage])

	const handleCommentBlock = React.useCallback((blockId: string) => {
		// Find the block element and compute its vertical offset from the
		// content scroll area so the comment form can be aligned with it.
		const blockEl = document.querySelector(`[data-id="${blockId}"]`)
		const scrollArea = document.querySelector('.c-fcd-content-scroll')
		if (blockEl && scrollArea) {
			const blockRect = blockEl.getBoundingClientRect()
			const scrollRect = scrollArea.getBoundingClientRect()
			setPendingCommentOffset(blockRect.top - scrollRect.top + scrollArea.scrollTop)
		} else {
			setPendingCommentOffset(undefined)
		}
		setPendingCommentAnchor(`b:${blockId}`)
		setShowComments(true)
	}, [])

	// Hover comment button (desktop) and context menu (desktop + mobile)
	const commentBlockIds = React.useMemo(() => new Set(blockThreadMap.keys()), [blockThreadMap])
	useCommentBlockButton(canComment, commentBlockIds, handleCommentBlock)
	useBlockContextMenu({
		enabled: canComment,
		isReadOnly: !canWrite,
		onCommentBlock: handleCommentBlock
	})

	const handleToggleTag = React.useCallback((tag: string) => {
		setActiveTags((prev) => {
			const next = new Set(prev)
			if (!next.delete(tag)) next.add(tag)
			return next
		})
		setShowFilter(true)
	}, [])

	const handleClearTags = React.useCallback(() => setActiveTags(new Set()), [])

	// The sidebar owns the single search surface; a bumped counter is all it takes
	// to hand it focus, so no imperative handle is needed.
	const [focusSearchSeq, setFocusSearchSeq] = React.useState(0)

	const requestSearchFocus = React.useCallback(() => {
		setShowFilter(true) // no-op at md/lg; opens the drawer on small screens
		setFocusSearchSeq((n) => n + 1)
	}, [])

	// Ctrl/Cmd+K focuses the sidebar search; `/` does too, but only outside an
	// editable field, where the editor's own slash menu owns the key. The shell
	// claims Ctrl+K globally, but notillo runs in a sandboxed iframe, so the key
	// never reaches it and is free to take.
	React.useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				requestSearchFocus()
				return
			}
			if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
			const target = e.target as HTMLElement | null
			if (target?.isContentEditable) return
			if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
			e.preventDefault()
			requestSearchFocus()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [requestSearchFocus])

	const isFiltering = !!searchQuery.trim() || activeTags.size > 0

	// One extra result over the cap distinguishes "exactly 50 matches" from "more
	// than 50"; only the first MAX_SIDEBAR_RESULTS are shown.
	const searchResults = React.useMemo(
		() =>
			searchPages({
				pages,
				query: searchQuery,
				tags: activeTags,
				contentHits,
				limit: MAX_SIDEBAR_RESULTS + 1
			}),
		[searchQuery, activeTags, pages, contentHits]
	)
	// Either cap can hide a match: the sidebar's own, or the server's on content hits.
	const resultsTruncated = searchResults.length > MAX_SIDEBAR_RESULTS || contentTruncated
	const filteredResults = React.useMemo(
		() =>
			searchResults.length > MAX_SIDEBAR_RESULTS
				? searchResults.slice(0, MAX_SIDEBAR_RESULTS)
				: searchResults,
		[searchResults]
	)

	const activePage = activePageId ? pages.get(activePageId) : undefined

	// A page that has no place in the tree — unfiled (created from an @-mention)
	// or orphaned by a parent that no longer exists — gets a "Current Page" card
	// above the tree instead, so it is still reachable while it is open.
	const unfiledPage = React.useMemo(() => {
		if (!activePage) return null
		return getAncestorIds(activePage.id, pages).reachesRoot ? null : activePage
	}, [activePage, pages])

	const {
		blocks,
		loading: blocksLoading,
		error: blocksError,
		retry: retryBlocks,
		loadedPageId,
		knownBlockIds,
		knownBlockOrders
	} = usePageBlocks(notillo.client, activePageId, notillo.ownerTag)

	// Share handlers
	const handleSharePage = React.useCallback(async () => {
		if (!activePageId) return
		const page = pages.get(activePageId)
		try {
			await getAppBus().requestShareLink({
				accessLevel: 'read',
				params: `nav=${encodeURIComponent(activePageId)}`,
				description: page?.title || t('Shared page'),
				reuse: true
			})
		} catch (err) {
			console.error('[Notillo] Share page failed:', err)
		}
	}, [activePageId, pages, t])

	const handleShareDocument = React.useCallback(async () => {
		try {
			await getAppBus().requestShareLink({
				accessLevel: 'read',
				description: t('Shared document'),
				reuse: true
			})
		} catch (err) {
			console.error('[Notillo] Share document failed:', err)
		}
	}, [t])

	// Export/import handlers
	const handleExportMarkdown = React.useCallback(async () => {
		if (!editorRef.current || !activePage) return
		try {
			await exportMarkdown(editorRef.current, activePage.title || t('Untitled'))
		} catch (err) {
			await dialog.tell(
				t('Export error'),
				t('Failed to export Markdown: {{error}}', { error: String(err) })
			)
		}
	}, [activePage, dialog, t])

	const handleExportPdf = React.useCallback(async () => {
		if (!editorRef.current || !activePage) return
		try {
			await exportPdf(editorRef.current, activePage.title || t('Untitled'), resolveFileUrl)
		} catch (err) {
			await dialog.tell(
				t('Export error'),
				t('Failed to export PDF: {{error}}', { error: String(err) })
			)
		}
	}, [activePage, dialog, resolveFileUrl, t])

	const handleExportDocx = React.useCallback(async () => {
		if (!editorRef.current || !activePage) return
		try {
			await exportDocx(editorRef.current, activePage.title || t('Untitled'), resolveFileUrl)
		} catch (err) {
			await dialog.tell(
				t('Export error'),
				t('Failed to export Word: {{error}}', { error: String(err) })
			)
		}
	}, [activePage, dialog, resolveFileUrl, t])

	const handleExportOdt = React.useCallback(async () => {
		if (!editorRef.current || !activePage) return
		try {
			await exportOdt(editorRef.current, activePage.title || t('Untitled'), resolveFileUrl)
		} catch (err) {
			await dialog.tell(
				t('Export error'),
				t('Failed to export OpenDocument: {{error}}', { error: String(err) })
			)
		}
	}, [activePage, dialog, resolveFileUrl, t])

	const handleImportMarkdown = React.useCallback(() => {
		fileInputRef.current?.click()
	}, [])

	const handleFileSelected = React.useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (!file || !editorRef.current) return
			// Reset input so the same file can be re-selected
			e.target.value = ''

			const confirmed = await dialog.confirm(
				t('Import Markdown'),
				t('This will replace the current page content. Continue?')
			)
			if (!confirmed) return

			try {
				const markdown = await file.text()
				await importMarkdown(editorRef.current, markdown, pages)
			} catch (err) {
				await dialog.tell(
					t('Import error'),
					t('Failed to import Markdown: {{error}}', { error: String(err) })
				)
			}
		},
		[dialog, pages, t]
	)

	// Import markdown as child/sibling page — parentPageId stored in ref
	const importParentRef = React.useRef<string>('__root__')

	const handleImportMarkdownAsChild = React.useCallback(() => {
		if (!activePageId) return
		importParentRef.current = activePageId
		childImportInputRef.current?.click()
	}, [activePageId])

	const handleImportMarkdownInto = React.useCallback((parentPageId: string) => {
		importParentRef.current = parentPageId
		childImportInputRef.current?.click()
	}, [])

	const handleChildImportFileSelected = React.useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (!file || !notillo.client || !notillo.idTag) return
			e.target.value = ''

			try {
				const markdown = await file.text()
				// Extract title from first heading or filename
				const headingMatch = markdown.match(/^#\s+(.+)$/m)
				const title =
					headingMatch?.[1]?.trim() || file.name.replace(/\.[^.]+$/, '') || 'Imported'
				const parentId = importParentRef.current
				const pageId = await createPage(notillo.client, notillo.idTag, title, parentId)
				setPendingImport({ markdown, pageId, source: 'local' })
				setActivePageId(pageId)
			} catch (err) {
				await dialog.tell(
					t('Import error'),
					t('Failed to import Markdown: {{error}}', { error: String(err) })
				)
			}
		},
		[notillo.client, notillo.idTag, dialog, t]
	)

	// Loading state
	if (notillo.loading) {
		return (
			<div className="c-vbox w-100 h-100 justify-content-center align-items-center">
				<Panel className="c-vbox align-items-center p-2">
					<LoadingSpinner size="lg" label={t('Connecting to Notillo…')} />
				</Panel>
			</div>
		)
	}

	// Error state
	if (notillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-content-center align-items-center">
				<Panel className="c-alert error">
					<h3>{t('Connection Error')}</h3>
					<p>{notillo.error.message}</p>
				</Panel>
			</div>
		)
	}

	// Only a page list we never received is fatal. Any websocket error fires every
	// subscription's `onError`, including the transient blip the client recovers
	// from on its own, and replacing the whole app on one of those would tear down
	// the editor along with whatever was being typed. With pages in hand the error
	// is reported inline instead (below).
	if (pagesError && pages.size === 0) {
		return (
			<div className="c-vbox w-100 h-100 justify-content-center align-items-center">
				<Panel className="c-vbox align-items-center p-2">
					<h3>{t('Could not load pages')}</h3>
					<p>{pagesError.message}</p>
					<Button onClick={retryPages}>{t('Try again')}</Button>
				</Panel>
			</div>
		)
	}

	if (!notillo.client || !notillo.idTag || !notillo.ownerTag) return null

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".md,text/markdown"
				style={{ display: 'none' }}
				onChange={handleFileSelected}
			/>
			<input
				ref={childImportInputRef}
				type="file"
				accept=".md,text/markdown"
				style={{ display: 'none' }}
				onChange={handleChildImportFileSelected}
			/>
			<Fcd.Container className="pt-2 g-2" fluid detailsMode="adaptive">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<Panel elevation="mid" className="c-vbox fill">
						<PageSidebar
							client={notillo.client}
							pages={pages}
							expanded={expanded}
							unfiledPage={unfiledPage}
							onExpand={expand}
							onToggleExpand={toggleExpand}
							activePageId={activePageId}
							onSelectPage={handleSelectPage}
							userId={notillo.idTag}
							readOnly={!canWrite}
							tags={tags}
							tagCounts={tagCounts}
							activeTags={activeTags}
							onToggleTag={handleToggleTag}
							onClearTags={handleClearTags}
							searchQuery={searchQuery}
							onSearchChange={setSearchQuery}
							filteredResults={filteredResults}
							resultsTruncated={resultsTruncated}
							isFiltering={isFiltering}
							contentSearchPending={
								!!searchQuery.trim() && contentSearchEnabled && !contentReady
							}
							contentSearchError={contentError}
							onRetryContentSearch={retryContentSearch}
							focusSearchSeq={focusSearchSeq}
							onSearchActivate={enableContentSearch}
							recentPageIds={recentPageIds}
							onImportMarkdown={canWrite ? handleImportMarkdownInto : undefined}
						/>
					</Panel>
				</Fcd.Filter>
				<Fcd.Content
					header={
						activePage ? (
							<PageHeader
								client={notillo.client}
								page={activePage}
								readOnly={!canWrite}
								onToggleSidebar={() => setShowFilter(true)}
								onToggleComments={
									canComment ? () => setShowComments((s) => !s) : undefined
								}
								commentCount={threadCount}
								onSharePage={handleSharePage}
								onShareDocument={handleShareDocument}
								onExportMarkdown={handleExportMarkdown}
								onExportPdf={handleExportPdf}
								onExportDocx={handleExportDocx}
								onExportOdt={handleExportOdt}
								onImportMarkdown={handleImportMarkdown}
								onImportMarkdownAsChild={handleImportMarkdownAsChild}
							/>
						) : (
							<nav
								className="c-nav px-3 py-2 g-2 md-hide lg-hide"
								style={{ borderBottom: '1px solid var(--col-outline)' }}
							>
								<Button
									kind="link"
									mode="icon"
									size="small"
									onClick={() => setShowFilter(true)}
									title={t('Open sidebar')}
								>
									<IcSidebar />
								</Button>
								<span className="font-semibold flex-fill">Notillo</span>
							</nav>
						)
					}
				>
					{/* Non-blocking: the loaded pages are still usable and the editor
					    stays mounted. `useAllPages` drops the error on its next `ready`
					    snapshot, so a recovered connection clears this by itself. */}
					{pagesError && (
						<div className="c-hbox align-items-center g-2 c-alert error" role="alert">
							<span className="flex-fill">{t('Page list may be out of date.')}</span>
							<Button kind="link" size="small" onClick={retryPages}>
								{t('Try again')}
							</Button>
						</div>
					)}
					{activePage ? (
						blocksError ? (
							<div className="c-vbox fill align-items-center justify-content-center">
								<EmptyState
									icon={<span className="text-3xl">⚠️</span>}
									title={t('Could not load this page')}
									description={blocksError.message}
									action={<Button onClick={retryBlocks}>{t('Try again')}</Button>}
								/>
							</div>
						) : blocksLoading || loadedPageId !== activePageId ? (
							<div className="c-vbox fill align-items-center justify-content-center">
								<LoadingSpinner />
							</div>
						) : (
							<NotilloEditorComponent
								key={activePageId}
								client={notillo.client}
								pageId={activePage.id}
								initialBlocks={blocks}
								knownBlockIds={knownBlockIds}
								knownBlockOrders={knownBlockOrders}
								readOnly={!canWrite}
								userId={notillo.idTag}
								ownerTag={notillo.ownerTag}
								token={notillo.token}
								darkMode={notillo.darkMode}
								fileId={notillo.fileId}
								pages={pages}
								onSelectPage={handleSelectPage}
								onTagClick={handleToggleTag}
								onEditorReady={handleEditorReady}
								onCommentBlock={canComment ? handleCommentBlock : undefined}
								tags={tags}
								pageTags={activePage.tags}
							/>
						)
					) : (
						<div className="c-vbox fill align-items-center justify-content-center text-center p-4">
							{pages.size === 0 ? (
								<>
									<div className="text-3xl opacity-50 mb-3">📝</div>
									<p>{t('No pages yet.')}</p>
									{canWrite && (
										<p>{t('Create a page from the sidebar to get started.')}</p>
									)}
								</>
							) : (
								<p>{t('Select a page from the sidebar.')}</p>
							)}
						</div>
					)}
				</Fcd.Content>
				{canComment && showComments && (
					<Fcd.Details
						isVisible={showComments}
						hide={() => setShowComments(false)}
						header={
							<ThreadListHeader
								readOnly={!canComment}
								onNewComment={() => commentPanelRef.current?.openNewComment()}
							/>
						}
					>
						<div className="c-vbox fill">
							{activePageId && notillo.idTag && (
								<CommentPanel
									ref={commentPanelRef}
									comments={comments}
									threads={pageThreads}
									pageId={activePageId}
									idTag={notillo.idTag}
									readOnly={!canComment}
									pendingAnchor={pendingCommentAnchor}
									pendingOffset={pendingCommentOffset}
									onPendingAnchorConsumed={() => {
										setPendingCommentAnchor(undefined)
										setPendingCommentOffset(undefined)
									}}
									focusBlockId={focusBlockId}
									onFocusBlockConsumed={() => setFocusBlockId(undefined)}
									hideHeader
								/>
							)}
						</div>
					</Fcd.Details>
				)}
				<DialogContainer />
			</Fcd.Container>
			{canComment && popupBlockId && notillo.idTag && blockThreadMap.get(popupBlockId) && (
				<CommentPopup
					comments={comments}
					threads={blockThreadMap.get(popupBlockId)!}
					blockId={popupBlockId}
					idTag={notillo.idTag}
					readOnly={!canComment}
					onClose={() => setPopupBlockId(null)}
				/>
			)}
		</>
	)
}

// vim: ts=4
