// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	createApiClient,
	getAppBus,
	getDocWsUrl,
	getFileUrl,
	parseSiteFileRef
} from '@cloudillo/core'
import type { CommentThread } from '@cloudillo/react'
import {
	AppDocBar,
	Button,
	DialogContainer,
	DocBarMenu,
	EmptyState,
	Fcd,
	LoadingSpinner,
	MenuDivider,
	MenuHeader,
	MenuItem,
	Panel,
	PresenceProvider,
	Toasts,
	useComments,
	useDialog,
	useIsMobile,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuSearchCheck as IcCheckRefs,
	LuMessageCircle as IcComment,
	LuLink as IcLink,
	LuSettings2 as IcProperties,
	LuGlobe as IcPublish,
	LuSettings as IcSettings,
	LuPanelLeft as IcSidebar
} from 'react-icons/lu'

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
import { useDocSettings } from './hooks/useDocSettings.js'
import { useHomePage } from './hooks/useHomePage.js'
import { useNotillo } from './hooks/useNotillo.js'
import { usePageBlocks } from './hooks/usePageBlocks.js'
import { useTags } from './hooks/useTags.js'
import { DocSettingsDialog } from './pages/DocSettingsDialog.js'
import { PagePropertiesPanel } from './pages/PagePropertiesPanel.js'
import { PageSidebar } from './pages/PageSidebar.js'
import type { PublishRef, PublishReport } from './publish/index.js'
import type { PublishDialogMode } from './publish/PublishDialog.js'
import { createPage, getAncestorIds, updatePage } from './rtdb/page-ops.js'
import { isTopLevel, ROOT_PARENT } from './rtdb/types.js'
import { childKindFor } from './utils/archetype.js'
import { derivePageMeta } from './utils/page-meta.js'
import { searchPages } from './utils/search.js'

/**
 * The publish pipeline, loaded when the author asks for it and not before.
 *
 * `publish/**` is ~40 KB minified plus `fflate`'s zip encoder, and none of it runs
 * until Publish or Check references is clicked — but a static import puts all of it
 * in the entry bundle, parsed on every document open. The build sets
 * `splitting: true` with `format: 'esm'` (`scripts/esbuild-common.js`), so these
 * become their own chunk. Type-only imports above stay static: they erase.
 */
const loadPublish = () => import('./publish/index.js')
const PublishDialog = React.lazy(async () => ({
	default: (await import('./publish/PublishDialog.js')).PublishDialog
}))

/** How many visited pages the sidebar offers with an empty query. */
const RECENT_PAGE_LIMIT = 8

/** Cap on rendered search rows — each one costs an ancestor walk for its breadcrumb. */
const MAX_SIDEBAR_RESULTS = 50

export function NotilloApp() {
	const { t } = useTranslation()
	const notillo = useNotillo()
	const dialog = useDialog()
	const { error: toastError } = useToast()
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
	// The document's own settings: whether it is a website at all, and which page is
	// served at the mount root. Live, unlike the per-page settings — the home page
	// decides the sidebar's shape for every collaborator, so a change has to
	// propagate rather than wait for a reload.
	const docSettings = useDocSettings(notillo.client)
	// `?? undefined`: a cleared setting is stored as `null` and means exactly what an
	// absent one means, and every consumer below takes `string | undefined`.
	const homePageId = docSettings.settings.homePageId ?? undefined
	const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
	const [activePageId, setActivePageId] = React.useState<string | undefined>()
	const [recentPageIds, setRecentPageIds] = React.useState<string[]>([])
	const [showFilter, setShowFilter] = React.useState(false)
	// The two details panes share one slot, so opening either closes the other.
	const [showComments, setShowComments] = React.useState(false)
	const [showProperties, setShowProperties] = React.useState(false)
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
				setShowProperties(false)
			}
		},
		[isMobile]
	)
	const { blockThreadMap } = useCommentIndicators(pageThreads, handleBadgeClick)

	const editorRef = React.useRef<NotilloEditor | null>(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const childImportInputRef = React.useRef<HTMLInputElement>(null)
	const commentPanelRef = React.useRef<ThreadListHandle | null>(null)
	// Filled by the mounted editor with its RTDB sync flush; a no-op when no page
	// is open. `publishSite` calls it so the newest typing is in RTDB, not still
	// sitting in a debounce timer, before the container is built.
	const syncFlushRef = React.useRef<() => void>(() => {})
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
				const pageId = await createPage(notillo.client!, notillo.idTag!, title, ROOT_PARENT)
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
			if (!notillo.ownerTag) return url
			// The legacy untyped `cl-file:ID` is normalised to `img` by the parser.
			const ref = parseSiteFileRef(url)
			if (!ref) return url

			const tokenOpt = notillo.token ? { token: notillo.token } : undefined
			const variant =
				ref.kind === 'img' ? 'vis.hd' : ref.kind === 'vid' ? 'vid.hd' : undefined
			const resolvedUrl = getFileUrl(notillo.ownerTag, ref.fileId, variant, tokenOpt)

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
			if (page.parentPageId === ROOT_PARENT && (!firstPage || page.order < firstPage.order)) {
				firstPage = { id: page.id, order: page.order }
			}
		}
		if (firstPage) handleSelectPage(firstPage.id)
	}, [pages, pagesReady, activePageId, notillo.navParam, handleSelectPage])

	const toggleComments = React.useCallback(() => {
		setShowComments((s) => !s)
		setShowProperties(false)
	}, [])

	const toggleProperties = React.useCallback(() => {
		setShowProperties((s) => !s)
		setShowComments(false)
	}, [])

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
		setShowProperties(false)
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

	// What the page's SEO fields would say with nothing filled in, shown as
	// placeholders in the property panel. Derived from the open page's blocks,
	// which is exactly the page that panel edits.
	const derivedMeta = React.useMemo(
		() => derivePageMeta(blocks, (pageId) => pages.get(pageId)?.title),
		[blocks, pages]
	)

	// A page filed under the home page is still at the top of the container: the
	// home page is the tree's root, not a directory of its own. The same fold
	// `resolveTree` applies, so the panel and the container cannot disagree.
	const atContainerRoot = !!activePage && isTopLevel(activePage.parentPageId, homePageId)

	// The page title is edited in the DocBar's second crumb, so the rename lands
	// here rather than in a header of its own.
	const handleRenamePage = React.useCallback(
		async (title: string) => {
			if (!notillo.client || !activePageId) return
			try {
				await updatePage(notillo.client, activePageId, { title })
			} catch (err) {
				// The editor closes and the crumb snaps back to the old title on
				// its own. Without this the only trace of a refused write — offline,
				// or another editor holding the lock — is a console rejection.
				console.error('[Notillo] Page rename failed:', err)
				toastError(t('Could not rename the page'))
			}
		},
		[notillo.client, activePageId, t, toastError]
	)

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

	// Publish the whole document as a site container. The gate runs first and the
	// dialog is where the author reads it; nothing is generated until that dialog
	// is confirmed.
	const [publishing, setPublishing] = React.useState(false)
	const [publishOpen, setPublishOpen] = React.useState(false)
	const [publishMode, setPublishMode] = React.useState<PublishDialogMode>('publish')
	const [publishReport, setPublishReport] = React.useState<PublishReport | undefined>()
	const [gateLoading, setGateLoading] = React.useState(false)
	const [gateError, setGateError] = React.useState<string | undefined>()
	// Where the site serves this document. Read from the shell, never declared
	// here — the mount table is site configuration. It decides which
	// reserved slugs apply and is shown in the dialog, so the gate resolves it
	// once and both consumers read the same answer.
	const [publishMountPath, setPublishMountPath] = React.useState<string | undefined>()
	// Whether the site serves this document at all. `POST /api/sites/publish`
	// refuses a document with no mount row, and the mount table is site settings —
	// there is no way to add one from here. Learning that after a full
	// build and upload is the worst moment to learn it, so the action is simply
	// not offered. `undefined` means the answer is not in yet or the lookup
	// failed; the action stays offered then, because a failed read must not take
	// a capability away.
	const [siteMounted, setSiteMounted] = React.useState<boolean | undefined>()

	/**
	 * Close the publish dialog and let go of its report.
	 *
	 * The report holds one `PublishPageEntry` per published page plus every
	 * `PublishRef` with its per-block `sites` array. Kept, it would sit in component
	 * state for the rest of the session and be replaced — not released — by the next
	 * gate run, so every close goes through here rather than `setPublishOpen(false)`.
	 */
	const closePublish = React.useCallback(() => {
		setPublishOpen(false)
		setPublishReport(undefined)
	}, [])

	// Every site feature in Notillo hangs off this one flag. The stored one wins;
	// absent, a document the site already serves is already a website, so the author
	// does not have to say so twice.
	//
	// `undefined` siteMounted — the lookup is in flight or failed — reads as
	// not-a-site, and so does a settings record that has not arrived yet: the site UI
	// appearing and then vanishing is worse than appearing a moment late.
	const siteMode = docSettings.ready
		? (docSettings.settings.siteMode ?? siteMounted === true)
		: false

	const homeActions = useHomePage({
		client: notillo.client,
		pages,
		homePageId,
		save: React.useCallback(
			(pageId: string | null) => docSettings.save({ homePageId: pageId }),
			[docSettings.save]
		)
	})

	// The document settings dialog, and the sidebar's home picker it can hand off to.
	const [docSettingsOpen, setDocSettingsOpen] = React.useState(false)
	const [homePickerSeq, setHomePickerSeq] = React.useState(0)

	// The fix for "no home page" is not on any page, so it lives in the sidebar —
	// which on a narrow screen is not on screen at all until this opens it.
	const handleChooseHome = React.useCallback(() => {
		setDocSettingsOpen(false)
		closePublish()
		setShowFilter(true)
		setHomePickerSeq((seq) => seq + 1)
	}, [closePublish])

	const handleSiteModeChange = React.useCallback(
		(on: boolean) => {
			docSettings.save({ siteMode: on }).catch((err) => {
				console.error('[Notillo] Could not save the document settings:', err)
				toastError(t('Could not save the document settings.'))
			})
		},
		[docSettings.save, t, toastError]
	)

	/**
	 * Ask the shell where the site serves this document, and remember both halves.
	 *
	 * Both halves, not just `mounted`: keeping the path too is what lets the
	 * doc-settings dialog say where the document is *actually* served — it read
	 * "Served at /" for a document mounted at `/blog` until the publish dialog had
	 * been opened once — and what lets the reserved-site-root warning in
	 * `PagePropertiesPanel` fire before the first gate run.
	 *
	 * A lookup failure is not a caller's failure and leaves the last answer standing:
	 * a read that failed knows nothing, and overwriting the path with `undefined`
	 * reads as "mounted at the root" to the dialog and the reserved-slug warning.
	 */
	const resolveMount = React.useCallback(
		async (isCancelled?: () => boolean): Promise<string | undefined> => {
			if (!notillo.fileId) return undefined
			try {
				const mount = await getAppBus().resolveSiteMount({ docFileId: notillo.fileId })
				if (isCancelled?.()) return undefined
				setSiteMounted(mount.mounted)
				setPublishMountPath(mount.mountPath)
				return mount.mountPath
			} catch (err) {
				console.warn('[Notillo] Could not read the mount path:', err)
				return undefined
			}
		},
		[notillo.fileId]
	)

	// Resolved on load rather than in the gate, because the menu has to be right
	// before the dialog exists. `runPublishGate` re-reads it at publish time — the
	// owner may have mounted the document in the meantime.
	React.useEffect(() => {
		let cancelled = false
		void resolveMount(() => cancelled)
		return () => {
			cancelled = true
		}
	}, [resolveMount])

	// An unowned document is our own, the same rule the RTDB server URL uses in
	// `useNotillo`.
	const ownerIdTag = notillo.ownerTag ?? notillo.idTag ?? ''

	// The same client `publishSite` builds, and built per call for the same
	// reason: the bus renews the access token behind us.
	const siteApi = React.useCallback(
		() => createApiClient({ idTag: ownerIdTag, authToken: getAppBus().accessToken }),
		[ownerIdTag]
	)

	const runPublishGate = React.useCallback(async () => {
		if (!notillo.client) return
		setGateLoading(true)
		setGateError(undefined)
		try {
			// The gate reads RTDB, so the newest typing has to be out of its
			// debounce timer first — the same reason `publishSite` flushes.
			syncFlushRef.current?.()
			const api = siteApi()

			// A lookup failure is not a gate failure: the reference check has to
			// keep working for someone who cannot read the mount table at all.
			// The gate then assumes the root, which over-reports rather than
			// letting a reserved slug through.
			const mountPath = await resolveMount()

			const { buildPublishReport } = await loadPublish()
			setPublishReport(
				await buildPublishReport({
					client: notillo.client,
					mountPath,
					...(homePageId !== undefined && { homePageId }),
					fetchFileInfo: async (fileId) => {
						const file = await api.files.getMetadata(fileId)
						// `null` and absent both mean "not public" to the gate.
						return { visibility: file.visibility ?? undefined, fileName: file.fileName }
					}
				})
			)
		} catch (err) {
			console.error('[Notillo] Publish check failed:', err)
			setPublishReport(undefined)
			setGateError(t('Could not check the document: {{error}}', { error: String(err) }))
		} finally {
			setGateLoading(false)
		}
	}, [notillo.client, resolveMount, siteApi, homePageId, t])

	const handleOpenPublish = React.useCallback(() => {
		setPublishMode('publish')
		setPublishOpen(true)
		void runPublishGate()
	}, [runPublishGate])

	// The same gate with nothing behind it. Publishing checks the references once,
	// at the moment it runs, and a file's visibility can be lowered afterwards —
	// after which only the reader sees the hole, never the author, who can read
	// their own files either way. So the check is offered on demand.
	const handleOpenCheckRefs = React.useCallback(() => {
		setPublishMode('check')
		setPublishOpen(true)
		void runPublishGate()
	}, [runPublishGate])

	// Offered, never done on the author's behalf: widening a file's audience is a
	// click per file, and the gate re-runs so the answer comes from the server.
	const handleMakeRefPublic = React.useCallback(
		async (ref: PublishRef) => {
			try {
				await siteApi().files.update(ref.fileId, { visibility: 'P' })
			} catch (err) {
				console.error('[Notillo] Could not make the file public:', err)
				toastError(t('Could not make that file public.'))
				return
			}
			await runPublishGate()
		},
		[runPublishGate, siteApi, t, toastError]
	)

	// One dialog row is one *file*, but its `sites` hold every block that references
	// it — a photo used on six pages is six blockIds behind one "Remove" button, and
	// the removal deletes all of them with no undo. So it is confirmed, the same way
	// deleting a page is (`PageSidebar`), and the message names both counts: what the
	// row shows is the file's name, not how much authored content goes with it.
	const handleRemoveRef = React.useCallback(
		async (ref: PublishRef) => {
			if (!notillo.client) return
			const blockCount = ref.sites.length
			const pageCount = new Set(ref.sites.map((site) => site.pageId)).size
			const name = ref.fileName || ref.fileId
			const message =
				blockCount === 1
					? t('Remove the block referencing “{{name}}”? This cannot be undone.', {
							name
						})
					: pageCount === 1
						? t(
								'Remove all {{count}} blocks referencing “{{name}}”? They are all on one page, and this cannot be undone.',
								{ count: blockCount, name }
							)
						: t(
								'Remove all {{count}} blocks referencing “{{name}}”, on {{pages}} pages? Some are on pages you are not looking at, and this cannot be undone.',
								{ count: blockCount, pages: pageCount, name }
							)
			if (!(await dialog.confirm(t('Remove reference'), message))) return
			try {
				const { removeSiteReference } = await loadPublish()
				// A `pageImage` site has no `blockId` — it is a page property, and
				// the author clears it in the properties panel. Filtered rather than
				// asserted: "remove" here deletes blocks, and there is no block.
				await removeSiteReference(
					notillo.client,
					ref.sites.map((site) => site.blockId).filter((id) => id !== undefined)
				)
			} catch (err) {
				console.error('[Notillo] Could not remove the reference:', err)
				toastError(t('Could not remove that reference.'))
				return
			}
			await runPublishGate()
		},
		[dialog, notillo.client, runPublishGate, t, toastError]
	)

	const handleGoToPublishPage = React.useCallback(
		(pageId: string) => {
			closePublish()
			handleSelectPage(pageId)
		},
		[closePublish, handleSelectPage]
	)

	const handlePublishSite = React.useCallback(async () => {
		if (!notillo.client || !notillo.fileId || publishing) return
		setPublishing(true)
		try {
			const { publishSite } = await loadPublish()
			const result = await publishSite({
				client: notillo.client,
				docFileId: notillo.fileId,
				ownerIdTag,
				flush: syncFlushRef,
				// The gate resolved it when the dialog opened, so the author
				// confirmed a publish to the path they were shown. Undefined only
				// if that lookup failed, and then `publishSite` retries it rather
				// than guessing.
				...(publishMountPath !== undefined && { mountPath: publishMountPath }),
				// The same value the gate the author just confirmed was built
				// against, so the container cannot claim a different front page
				// from the one the dialog listed at `/`.
				...(homePageId !== undefined && { homePageId })
			})
			closePublish()
			await dialog.tell(
				t('Site published'),
				result.slugsFrozen
					? t('Published {{count}} page(s).', { count: result.pageCount })
					: t(
							'Published {{count}} page(s), but the page addresses could not be pinned. Publish again to fix it — until then, renaming a page can move its live address.',
							{ count: result.pageCount }
						)
			)
		} catch (err) {
			console.error('[Notillo] Publish failed:', err)
			await dialog.tell(
				t('Publish error'),
				t('Failed to publish the site: {{error}}', { error: String(err) })
			)
		} finally {
			setPublishing(false)
		}
	}, [
		notillo.client,
		notillo.fileId,
		ownerIdTag,
		publishing,
		publishMountPath,
		homePageId,
		dialog,
		t
	])

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
	const importParentRef = React.useRef<string>(ROOT_PARENT)

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
				const pageId = await createPage(
					notillo.client,
					notillo.idTag,
					title,
					parentId,
					childKindFor(parentId === ROOT_PARENT ? undefined : pages.get(parentId))
				)
				setPendingImport({ markdown, pageId, source: 'local' })
				setActivePageId(pageId)
			} catch (err) {
				await dialog.tell(
					t('Import error'),
					t('Failed to import Markdown: {{error}}', { error: String(err) })
				)
			}
		},
		[notillo.client, notillo.idTag, pages, dialog, t]
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
		// Computed once here and read off the context by everyone who needs it — the
		// DocBar's avatar stack, the sidebar's per-page faces, the editor's block
		// indicators. Subscribing three times would mean three throttles and three
		// rounds of profile lookups. `<AppDocBar>` prefers the context over its prop.
		<PresenceProvider source={notillo.presence}>
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
			{/* `c-vbox h-100` with the container as the flex child: without it the
			    filter and details panes lose their height. */}
			<div className="c-vbox h-100">
				<AppDocBar
					start={
						<Button
							kind="link"
							mode="icon"
							size="small"
							className="md-hide lg-hide"
							onClick={() => setShowFilter(true)}
							title={t('Open sidebar')}
						>
							<IcSidebar />
						</Button>
					}
					sub={
						activePage
							? {
									// `emptyLabel` and not `||`: the raw title seeds
									// the rename box, which must start empty
									// rather than with "Untitled" to delete.
									label: activePage.title ?? '',
									emptyLabel: t('Untitled'),
									icon: activePage.icon,
									canRename: canWrite,
									onRename: handleRenamePage
								}
							: undefined
					}
					subActions={
						activePage ? (
							<>
								{/* The site fields of this page. Read-only mounts get it
								    too — seeing how a page will be published is not an
								    editing act. The pane holds nothing but site fields,
								    so with site mode off it would open empty. */}
								{siteMode && (
									<Button
										kind="link"
										mode="icon"
										size="small"
										aria-pressed={showProperties}
										onClick={toggleProperties}
										title={t('Page settings')}
									>
										<IcProperties size={20} />
									</Button>
								)}
								{canComment && (
									// The badge is absolutely positioned against this wrapper.
									<div style={{ position: 'relative' }}>
										<Button
											kind="link"
											mode="icon"
											size="small"
											onClick={toggleComments}
											title={t('Comments')}
										>
											<IcComment size={20} />
											{threadCount > 0 && (
												<span className="comment-badge">{threadCount}</span>
											)}
										</Button>
									</div>
								)}
							</>
						) : undefined
					}
				>
					{/* Two labelled sections, because everything below the divider acts
					    on the current page, not on the document. */}
					<DocBarMenu>
						<MenuHeader>{t('Document')}</MenuHeader>
						<MenuItem
							icon={<IcLink />}
							label={t('Share document')}
							disabled={!canWrite}
							onClick={handleShareDocument}
						/>
						<MenuItem
							icon={<IcSettings />}
							label={t('Document settings…')}
							onClick={() => setDocSettingsOpen(true)}
						/>
						{/* Hidden rather than disabled while the document is not part
						    of the site: a disabled item promises the action is available
						    here once some condition is met, and this one is met in site
						    settings, in another app. Site mode is the same shape of
						    condition — it is met in the document settings dialog. */}
						{siteMode && siteMounted !== false && (
							<MenuItem
								icon={<IcPublish />}
								label={publishing ? t('Publishing…') : t('Publish site…')}
								disabled={!canWrite || publishing}
								onClick={handleOpenPublish}
							/>
						)}
						{siteMode && (
							<MenuItem
								icon={<IcCheckRefs />}
								label={t('Check references…')}
								disabled={!canWrite || publishing}
								onClick={handleOpenCheckRefs}
							/>
						)}
						<MenuDivider />
						<MenuHeader>{t('This page')}</MenuHeader>
						<MenuItem
							icon={<IcLink />}
							label={t('Share this page')}
							disabled={!canWrite || !activePage}
							onClick={handleSharePage}
						/>
						<MenuItem
							label={t('Export as Markdown (.md)')}
							disabled={!activePage}
							onClick={handleExportMarkdown}
						/>
						<MenuItem
							label={t('Export as PDF (.pdf)')}
							disabled={!activePage}
							onClick={handleExportPdf}
						/>
						<MenuItem
							label={t('Export as Word (.docx)')}
							disabled={!activePage}
							onClick={handleExportDocx}
						/>
						<MenuItem
							label={t('Export as OpenDocument (.odt)')}
							disabled={!activePage}
							onClick={handleExportOdt}
						/>
						{canWrite && (
							<>
								<MenuItem
									label={t('Import Markdown (overwrite this page)')}
									disabled={!activePage}
									onClick={handleImportMarkdown}
								/>
								<MenuItem
									label={t('Import Markdown as child page')}
									disabled={!activePage}
									onClick={handleImportMarkdownAsChild}
								/>
							</>
						)}
					</DocBarMenu>
				</AppDocBar>
				<Fcd.Container className="pt-2 g-2 flex-fill" fluid detailsMode="adaptive">
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
								siteMode={siteMode}
								homePageId={homePageId}
								onSetHome={homeActions.setHome}
								onClearHome={homeActions.clearHome}
								homeBusy={homeActions.busy}
								homePickerSeq={homePickerSeq}
							/>
						</Panel>
					</Fcd.Filter>
					{/* No `header`: the page title, its comments toggle and its actions
					    all live in the DocBar's second crumb now. */}
					<Fcd.Content>
						{/* Non-blocking: the loaded pages are still usable and the editor
					    stays mounted. `useAllPages` drops the error on its next `ready`
					    snapshot, so a recovered connection clears this by itself. */}
						{pagesError && (
							<div
								className="c-hbox align-items-center g-2 c-alert error"
								role="alert"
							>
								<span className="flex-fill">
									{t('Page list may be out of date.')}
								</span>
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
										action={
											<Button onClick={retryBlocks}>{t('Try again')}</Button>
										}
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
									presence={notillo.presence}
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
									homePageId={homePageId}
									onSelectPage={handleSelectPage}
									onTagClick={handleToggleTag}
									onEditorReady={handleEditorReady}
									onCommentBlock={canComment ? handleCommentBlock : undefined}
									syncFlushRef={syncFlushRef}
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
											<p>
												{t(
													'Create a page from the sidebar to get started.'
												)}
											</p>
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
					{showProperties && siteMode && activePage && (
						<Fcd.Details
							isVisible={showProperties}
							hide={() => setShowProperties(false)}
							header={
								<span className="font-semibold text-sm">{t('Page settings')}</span>
							}
						>
							<PagePropertiesPanel
								// Keyed so a refused save or a rejected slug on one
								// page does not stay on screen under the next one —
								// both notices are panel state.
								key={activePage.id}
								client={notillo.client}
								pageId={activePage.id}
								title={activePage.title ?? ''}
								// Live off the page map: the pane's own record is a
								// one-shot read, and a publish writes both of these
								// after it.
								publishedAt={activePage.publishedAt}
								liveSlug={activePage.slug}
								derived={derivedMeta}
								atContainerRoot={atContainerRoot}
								// The site root needs the mount path, which the mount
								// lookup on load resolves. Still advisory: the gate
								// re-reads it at publish time, and it is that copy that
								// blocks a publish.
								atRoot={atContainerRoot && publishMountPath === '/'}
								isHome={activePage.id === homePageId}
								// Offered where it can work: a subpage would have to be
								// moved to the top level first.
								canBecomeHome={atContainerRoot && activePage.id !== homePageId}
								onToggleHome={() => {
									if (activePage.id === homePageId) void homeActions.clearHome()
									else void homeActions.setHome(activePage.id)
								}}
								readOnly={!canWrite}
							/>
						</Fcd.Details>
					)}
					{/* Mounted only while open: the component is lazy, and rendering
					    it closed would fetch the chunk on every document open, which
					    is exactly what the split avoids. No fallback — the dialog is
					    the whole UI, and a spinner behind it would flash. */}
					{publishOpen && (
						<React.Suspense fallback={null}>
							<PublishDialog
								open={publishOpen}
								mode={publishMode}
								report={publishReport}
								loading={gateLoading}
								error={gateError}
								publishing={publishing}
								mountPath={publishMountPath}
								// A share-link guest has no idTag, so a visibility write
								// would 403 — offer the action only where it can work.
								canMakePublic={!!notillo.idTag}
								onMakePublic={handleMakeRefPublic}
								onRemove={handleRemoveRef}
								onGoToPage={handleGoToPublishPage}
								onChooseHome={handleChooseHome}
								onPublish={handlePublishSite}
								onClose={closePublish}
							/>
						</React.Suspense>
					)}
					<DocSettingsDialog
						open={docSettingsOpen}
						siteMode={siteMode}
						onSiteModeChange={handleSiteModeChange}
						siteMounted={siteMounted}
						mountPath={publishMountPath}
						homeTitle={homePageId ? pages.get(homePageId)?.title : undefined}
						onChooseHome={handleChooseHome}
						readOnly={!canWrite}
						onClose={() => setDocSettingsOpen(false)}
					/>
					<DialogContainer />
					<Toasts />
				</Fcd.Container>
			</div>
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
		</PresenceProvider>
	)
}

// vim: ts=4
