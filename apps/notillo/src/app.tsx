// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { getAppBus, getFileUrl, getWsUrl } from '@cloudillo/core'
import { Fcd, Panel, Button, DialogContainer, useDialog, useComments } from '@cloudillo/react'
import type { CommentThread } from '@cloudillo/react'

import { LuPanelLeft as IcSidebar } from 'react-icons/lu'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './i18n.js'
import './style.css'

import type { NotilloEditor } from './editor/schema.js'
import { useNotillo } from './hooks/useNotillo.js'
import { useLazyPageTree } from './hooks/useLazyPageTree.js'
import { usePageBlocks } from './hooks/usePageBlocks.js'
import { useTags } from './hooks/useTags.js'
import { useAllPages } from './hooks/useAllPages.js'
import { NotilloEditor as NotilloEditorComponent } from './editor/NotilloEditor.js'
import { PageSidebar } from './pages/PageSidebar.js'
import { PageHeader } from './pages/PageHeader.js'
import { exportMarkdown, importMarkdown, exportPdf, exportDocx, exportOdt } from './export/index.js'
import { createPage } from './rtdb/page-ops.js'
import { CommentPanel, CommentPopup } from './comments/index.js'
import { useCommentIndicators } from './hooks/useCommentIndicators.js'
import { useBlockContextMenu } from './hooks/useBlockContextMenu.js'
import { useCommentBlockButton } from './hooks/useCommentBlockButton.js'

export function NotilloApp() {
	const { t } = useTranslation()
	const notillo = useNotillo()
	const dialog = useDialog()
	const canWrite = notillo.access === 'write'
	const canComment = notillo.access !== 'read'
	const {
		pages,
		pagesWithChildren,
		expanded,
		loadingChildren,
		rootsLoaded,
		orphanPage,
		expand,
		toggleExpand,
		navigateToPage,
		resubscribe
	} = useLazyPageTree(notillo.client)
	const { tags, tagCounts } = useTags(notillo.client)
	const { allPages } = useAllPages(notillo.client)
	const [activePageId, setActivePageId] = React.useState<string | undefined>()
	const [showFilter, setShowFilter] = React.useState(false)
	const [showComments, setShowComments] = React.useState(false)
	const [threadCount, setThreadCount] = React.useState(0)
	const [pendingCommentAnchor, setPendingCommentAnchor] = React.useState<string | undefined>()
	const [pendingCommentOffset, setPendingCommentOffset] = React.useState<number | undefined>()
	const [popupBlockId, setPopupBlockId] = React.useState<string | null>(null)
	const [pageThreads, setPageThreads] = React.useState<CommentThread[]>([])
	const [activeTag, setActiveTag] = React.useState<string | null>(null)
	const [searchQuery, setSearchQuery] = React.useState('')

	const commentsServerUrl = notillo.ownerTag
		? getWsUrl(notillo.ownerTag)
		: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

	const getCommentToken = React.useCallback(() => getAppBus().accessToken, [])

	const comments = useComments({
		fileId: notillo.fileId || '',
		serverUrl: commentsServerUrl,
		getToken: getCommentToken,
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
	const handleBadgeClick = React.useCallback((blockId: string) => {
		if (window.innerWidth < 768) {
			setPopupBlockId(blockId)
		} else {
			setFocusBlockId(blockId)
			setShowComments(true)
		}
	}, [])
	const { blockThreadMap } = useCommentIndicators(pageThreads, handleBadgeClick)

	const editorRef = React.useRef<NotilloEditor | null>(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const childImportInputRef = React.useRef<HTMLInputElement>(null)
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
				importMarkdown(editor, pendingImport.markdown, allPages)
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
		[pendingImport, activePageId, allPages]
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
	}, [notillo.client, canWrite])

	// Auto-select initial page: deep link (nav param) or first root page
	const resolvingRef = React.useRef(false)
	React.useEffect(() => {
		if (activePageId || !rootsLoaded || pages.size === 0 || !notillo.client) return
		if (resolvingRef.current) return

		let cancelled = false
		resolvingRef.current = true

		async function resolveInitialPage() {
			// Deep link: try nav param first
			if (notillo.navParam) {
				try {
					// 1. Try as page ID — direct document lookup
					const doc = await notillo.client!.ref('p/' + notillo.navParam).get()
					if (cancelled) return
					if (doc.exists) {
						setActivePageId(notillo.navParam)
						await navigateToPage(notillo.navParam)
						if (cancelled) return
						return
					}
					// 2. Try as page title — query by 'ti' field (exact match)
					const snap = await notillo
						.client!.collection('p')
						.where('ti', '==', notillo.navParam)
						.limit(1)
						.get()
					if (cancelled) return
					if (snap.size > 0) {
						const pageId = snap.docs[0].id
						setActivePageId(pageId)
						await navigateToPage(pageId)
						if (cancelled) return
						return
					}
				} catch (err) {
					console.warn('[Notillo] Deep link resolution failed:', err)
				}
			}

			if (cancelled) return

			// Fallback: select first root page by order
			let firstPage: { id: string; order: number } | undefined
			for (const page of pages.values()) {
				if (
					page.parentPageId === '__root__' &&
					(!firstPage || page.order < firstPage.order)
				) {
					firstPage = { id: page.id, order: page.order }
				}
			}
			if (firstPage) {
				setActivePageId(firstPage.id)
			}
		}
		resolveInitialPage()

		return () => {
			cancelled = true
			resolvingRef.current = false
		}
	}, [pages, activePageId, rootsLoaded, notillo.client, notillo.navParam, navigateToPage])

	const handleSelectPage = React.useCallback(
		async (pageId: string) => {
			setActivePageId(pageId)
			setShowFilter(false)
			await navigateToPage(pageId)
		},
		[navigateToPage]
	)

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

	const handleTagClick = React.useCallback((tag: string) => {
		setActiveTag(tag)
		setShowFilter(true)
	}, [])

	const isFiltering = !!searchQuery || !!activeTag

	const filteredResults = React.useMemo(() => {
		if (!searchQuery && !activeTag) return []
		const query = searchQuery.toLowerCase()
		const results: Array<{ id: string; title: string; icon?: string; tags?: string[] }> = []
		for (const page of allPages.values()) {
			if (activeTag && !page.tags?.includes(activeTag)) continue
			if (query && !page.title.toLowerCase().includes(query)) continue
			results.push({ id: page.id, title: page.title, icon: page.icon, tags: page.tags })
		}
		return results.sort((a, b) => {
			if (query) {
				const aPrefix = a.title.toLowerCase().startsWith(query)
				const bPrefix = b.title.toLowerCase().startsWith(query)
				if (aPrefix && !bPrefix) return -1
				if (!aPrefix && bPrefix) return 1
			}
			return a.title.localeCompare(b.title)
		})
	}, [searchQuery, activeTag, allPages])

	const activePage = activePageId ? pages.get(activePageId) : undefined
	const {
		blocks,
		loading: blocksLoading,
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
				await importMarkdown(editorRef.current, markdown, allPages)
			} catch (err) {
				await dialog.tell(
					t('Import error'),
					t('Failed to import Markdown: {{error}}', { error: String(err) })
				)
			}
		},
		[dialog, allPages, t]
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
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-vbox align-center p-2">
					<div className="c-spinner large" />
					<p className="mt-2">{t('Connecting to Notillo...')}</p>
				</Panel>
			</div>
		)
	}

	// Error state
	if (notillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-alert error">
					<h3>{t('Connection Error')}</h3>
					<p>{notillo.error.message}</p>
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
			<Fcd.Container className="pt-2 g-2">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<Panel elevation="mid" className="c-vbox fill">
						<PageSidebar
							client={notillo.client}
							pages={pages}
							pagesWithChildren={pagesWithChildren}
							expanded={expanded}
							loadingChildren={loadingChildren}
							orphanPage={orphanPage}
							onExpand={expand}
							onToggleExpand={toggleExpand}
							activePageId={activePageId}
							onSelectPage={handleSelectPage}
							userId={notillo.idTag}
							readOnly={!canWrite}
							tags={tags}
							tagCounts={tagCounts}
							activeTag={activeTag}
							onSelectTag={handleTagClick}
							onClearTag={() => setActiveTag(null)}
							searchQuery={searchQuery}
							onSearchChange={setSearchQuery}
							filteredResults={filteredResults}
							isFiltering={isFiltering}
							onResubscribe={resubscribe}
							onImportMarkdown={canWrite ? handleImportMarkdownInto : undefined}
						/>
					</Panel>
				</Fcd.Filter>
				<Fcd.Content
					fluid={!showComments}
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
									link
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
					{activePage ? (
						blocksLoading || loadedPageId !== activePageId ? (
							<div className="c-vbox fill align-items-center justify-content-center">
								<div className="c-spinner" />
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
								onTagClick={handleTagClick}
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
					<Fcd.Details isVisible={showComments} hide={() => setShowComments(false)}>
						<div className="c-vbox fill">
							{activePageId && notillo.idTag && (
								<CommentPanel
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
