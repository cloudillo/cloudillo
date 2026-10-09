// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { type Block, UniqueID } from '@blocknote/core'
import {
	filterSuggestionItems,
	SideMenuExtension,
	SuggestionMenu
} from '@blocknote/core/extensions'
import { BlockNoteView } from '@blocknote/mantine'
import {
	BlockColorsItem,
	type DefaultReactSuggestionItem,
	DragHandleMenu,
	FormattingToolbar,
	FormattingToolbarController,
	getFormattingToolbarItems,
	RemoveBlockItem,
	SideMenu,
	SideMenuController,
	SuggestionMenuController,
	useComponentsContext,
	useCreateBlockNote,
	useExtensionState
} from '@blocknote/react'
import { Extension as TiptapExtension } from '@tiptap/core'
import { Plugin as ProseMirrorPlugin } from '@tiptap/pm/state'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import '@blocknote/mantine/style.css'

import {
	getAppBus,
	getFileUrl,
	getImageVariantForDisplaySize,
	parseSiteFileRef
} from '@cloudillo/core'
import { usePresence, useReflowViewReport } from '@cloudillo/react'
import type { RtdbClient, RtdbPresence } from '@cloudillo/rtdb'

import { useBlockLocks } from '../hooks/useBlockLocks.js'
import { useEditorLocks } from '../hooks/useEditorLocks.js'
import { useDocumentSync, useRtdbToEditor } from '../hooks/useEditorSync.js'
import { type BlockPeer, useLockIndicators } from '../hooks/useLockIndicators.js'
import { usePageTagSync } from '../hooks/usePageTagSync.js'
import { usePresencePublisher } from '../hooks/usePresencePublisher.js'
import { type ListingPage, listingParentId } from '../publish/listing.js'
import { shortId } from '../rtdb/ids.js'
import { createPage } from '../rtdb/page-ops.js'
import type { PageRecord } from '../rtdb/types.js'
import { foldDiacritics, searchPages } from '../utils/search.js'
import { IndexToolbarItems } from './IndexToolbar.js'
import { NotilloEditorProvider } from './NotilloEditorContext.js'
import { asBaseEditor, type NotilloEditor as NotilloEditorType, notilloSchema } from './schema.js'
import { notilloThemeOverrides } from './theme.js'
import { useMediaHandler } from './useMediaHandler.js'

/** Wiki-style link trigger. Opens the same page picker as `@`. */
const WIKI_LINK_TRIGGER = '[['

const WIKI_LINK_SUGGESTION_LIMIT = 30

/**
 * Detect a typed `[[` and hand over to BlockNote's suggestion plugin.
 *
 * BlockNote supports multi-character triggers everywhere except in its own
 * detection: `handleTextInput` compares an N-character trigger against the N
 * characters *before* the caret plus the one being typed — N+1 characters — so a
 * two-character trigger can never match. So detect the second `[` here, remove
 * the first, and let `openSuggestionMenu` re-insert `[[` as the trigger, which
 * keeps it visible while typing and deletes it on selection like the `@` flow.
 */
function createWikiLinkTrigger(editorRef: React.RefObject<NotilloEditorType | null>) {
	return TiptapExtension.create({
		name: 'notilloWikiLinkTrigger',
		priority: 1100,
		addProseMirrorPlugins() {
			return [
				new ProseMirrorPlugin({
					props: {
						handleTextInput(view, from, to, text) {
							if (from !== to || text !== '[' || from < 1) return false
							// `[[` is literal text inside a code block.
							if (view.state.selection.$from.parent.type.spec.code) return false
							if (view.state.doc.textBetween(from - 1, from) !== '[') return false

							// Resolve the menu before mutating: consuming the keystroke
							// and deleting the first bracket without anything to open
							// would eat both characters.
							const menu = editorRef.current?.getExtension(SuggestionMenu)
							if (!menu) return false

							// Kept out of the history so undo sees only the `[[` the
							// menu re-inserts — one step, not two.
							view.dispatch(
								view.state.tr.delete(from - 1, from).setMeta('addToHistory', false)
							)
							// Opening dispatches its own transaction; defer so it
							// applies on top of the delete above.
							queueMicrotask(() => {
								if (view.isDestroyed) return
								try {
									menu.openSuggestionMenu(WIKI_LINK_TRIGGER, {
										deleteTriggerCharacter: true
									})
								} catch (err) {
									// Nothing re-inserted the trigger, so put both
									// brackets back rather than swallow a keystroke.
									console.error('[Notillo] `[[` trigger failed:', err)
									if (view.isDestroyed) return
									view.dispatch(
										view.state.tr.insertText(
											WIKI_LINK_TRIGGER,
											view.state.selection.from
										)
									)
								}
							})
							return true
						}
					}
				})
			]
		}
	})
}

// Override BlockNote's UUID generator with short base-62 IDs.
// UniqueID.options is a getter (returns fresh object each access),
// so we must patch config.addOptions instead of direct assignment.
const _origAddOptions = UniqueID.config.addOptions!
UniqueID.config.addOptions = function () {
	return { ..._origAddOptions.call(this), generateID: shortId }
}

function CommentBlockMenuItem({
	children,
	onCommentBlock
}: {
	children: React.ReactNode
	onCommentBlock: (blockId: string) => void
}) {
	const components = useComponentsContext()
	const block = useExtensionState(SideMenuExtension, {
		selector: (s) => s?.block
	})

	if (!block || !components) return null

	return (
		<components.Generic.Menu.Item
			className="bn-menu-item"
			onClick={() => onCommentBlock(block.id)}
		>
			{children}
		</components.Generic.Menu.Item>
	)
}

interface NotilloEditorProps {
	client: RtdbClient
	/** Absent until the socket is up, or on a document with no presence channel. */
	presence?: RtdbPresence
	pageId: string
	initialBlocks: Block[]
	knownBlockIds: Set<string>
	knownBlockOrders: Map<string, number>
	readOnly: boolean
	/** Write access to the document (unlike `readOnly`, independent of embed activation) */
	canWrite?: boolean
	userId: string
	ownerTag: string
	token?: string
	darkMode: boolean
	fileId?: string
	pages: Map<string, PageRecord & { id: string }>
	/**
	 * The document's home page, passed down for the `index` block: a listing buckets
	 * its rows the way the published tree does, and that fold depends on it. See
	 * `listingParentId` in `publish/listing.ts`.
	 */
	homePageId?: string
	onSelectPage: (pageId: string) => void
	onTagClick?: (tag: string) => void
	onEditorReady?: (editor: NotilloEditorType) => void
	onCommentBlock?: (blockId: string) => void
	/**
	 * Filled with `useDocumentSync`'s flush so the publisher can commit pending
	 * debounced writes before it reads the document back out of RTDB.
	 *
	 * Only this page's writes: `useDocumentSync` is per-page, and every other page
	 * was already flushed by the teardown that ran when it was switched away from.
	 */
	syncFlushRef?: React.RefObject<() => void>
	tags: Set<string>
	pageTags?: string[]
	/** Embedded as a reflow view: report this page's height to the host. */
	embedded?: boolean
	embedTitle?: string
	/** Host text scale (embed only), applied as a font-size factor. */
	textScale?: number
}

const NO_ELEMENT: React.RefObject<HTMLElement | null> = { current: null }

export const NotilloEditor = React.memo(
	function NotilloEditor({
		client,
		presence,
		pageId,
		initialBlocks,
		knownBlockIds,
		knownBlockOrders,
		readOnly,
		canWrite,
		userId,
		ownerTag,
		token,
		darkMode,
		fileId,
		pages,
		homePageId,
		onSelectPage,
		onTagClick,
		onEditorReady,
		onCommentBlock,
		syncFlushRef,
		tags,
		pageTags,
		embedded,
		embedTitle,
		textScale
	}: NotilloEditorProps) {
		const { t } = useTranslation()
		const containerWidthRef = React.useRef(900)

		const resolveFileUrl = React.useCallback(
			async (url: string) => {
				// `cl-file:img:ID` / `vid` / `aud`, with the legacy untyped
				// `cl-file:ID` normalised to `img` — one parser, shared with the
				// publisher's serializer.
				const ref = parseSiteFileRef(url)
				if (!ref) return url

				const tokenOpt = token ? { token } : undefined
				// An unresolvable fileId falls back to the unchanged url, as an
				// unparseable ref does — the media then fails to load visibly.
				if (ref.kind === 'img') {
					const px = containerWidthRef.current * (globalThis.devicePixelRatio || 1)
					const variant = getImageVariantForDisplaySize(px, px)
					return getFileUrl(ownerTag, ref.fileId, variant, tokenOpt) ?? url
				}
				if (ref.kind === 'vid') {
					return getFileUrl(ownerTag, ref.fileId, 'vid.hd', tokenOpt) ?? url
				}
				// 'aud' or unknown kind — no variant
				return getFileUrl(ownerTag, ref.fileId, undefined, tokenOpt) ?? url
			},
			[ownerTag, token]
		)

		// The `[[` trigger plugin is built before the editor exists, so it reaches
		// the editor through a ref that is filled in right after creation.
		const editorHandleRef = React.useRef<NotilloEditorType | null>(null)
		const wikiLinkTrigger = React.useMemo(() => createWikiLinkTrigger(editorHandleRef), [])

		// The paste handler is fixed at creation; access can change after it (upgrade)
		const noLinkPasteRef = React.useRef(false)
		noLinkPasteRef.current = readOnly || !!embedded

		const editor = useCreateBlockNote({
			schema: notilloSchema,
			// biome-ignore lint/suspicious/noExplicitAny: BlockNote initialContent type boundary with custom schema
			initialContent: initialBlocks.length > 0 ? (initialBlocks as any) : undefined,
			resolveFileUrl,
			// A pasted `cl:` doc link becomes an embed; the shell creates the share and shows
			// the permission disclosure. Cancel or failure inserts nothing; the shell toasts the reason.
			pasteHandler: ({ event, editor, defaultPasteHandler }) => {
				const p =
					fileId && !noLinkPasteRef.current
						? getAppBus().linkFromPaste(event, fileId)
						: undefined
				if (!p) return defaultPasteHandler()
				const anchor = editor.getTextCursorPosition().block
				p.then((res) => {
					if (!res) return
					editor.insertBlocks(
						[
							{
								type: 'documentEmbed',
								props: {
									fileId: res.fileId,
									contentType: res.contentType,
									appId: res.appId ?? '',
									navState: res.nav ?? '',
									name: res.fileName
								}
							}
						],
						anchor,
						'after'
					)
				})
				return true
			},
			// Suppress Tiptap Link's built-in click-to-open behavior. Tiptap
			// Link registers a ProseMirror plugin whose `handleClick` calls
			// `window.open` on any click inside an `<a>`. ProseMirror runs
			// that plugin from its own `mouseup` listener, which fires
			// before any DOM `click` listener we can attach — so DOM-level
			// preventDefault/stopPropagation is too late.
			//
			// Instead we add a higher-priority extension whose own
			// handleClick plugin returns `true` whenever the click lands on
			// an anchor. ProseMirror's `handleSingleClick` is short-
			// circuited on the first plugin that returns truthy (see
			// prosemirror-view source), so Tiptap Link's handleClick never
			// runs. Link's priority is 1000; priority 1100 puts ours first.
			_tiptapOptions: {
				extensions: [
					TiptapExtension.create({
						name: 'notilloLinkClickGuard',
						priority: 1100,
						addProseMirrorPlugins() {
							return [
								new ProseMirrorPlugin({
									props: {
										handleClick(_view, _pos, event) {
											const target = event.target as HTMLElement | null
											if (target?.closest?.('a[href]')) {
												// Swallow the click at the
												// ProseMirror level. The DOM
												// capture listener on window
												// (below) still decides what
												// to do with the click (open
												// on Cmd/Ctrl/middle-click or
												// in read-only mode).
												return true
											}
											return false
										}
									}
								})
							]
						}
					}),
					wikiLinkTrigger
				]
			}
		})

		// Filled after commit, not during render: the only reader is the trigger
		// plugin's `handleTextInput`, which needs a mounted editor to fire at all.
		React.useLayoutEffect(() => {
			editorHandleRef.current = editor
		}, [editor])

		const onEditorReadyRef = React.useRef(onEditorReady)
		React.useEffect(() => {
			onEditorReadyRef.current = onEditorReady
		})
		React.useEffect(() => {
			onEditorReadyRef.current?.(editor)
		}, [editor])

		// Local changes → RTDB (smart per-block sync with position tracking)
		const { recentLocalUpdates, blockStates, flush } = useDocumentSync(
			asBaseEditor(editor),
			client,
			pageId,
			userId,
			ownerTag,
			readOnly,
			knownBlockIds,
			knownBlockOrders
		)

		// Editor → page tag sync (debounced, self-healing). Above the flush effect
		// because that effect composes this hook's flush with the block one's.
		const { flush: tagFlush } = usePageTagSync(
			asBaseEditor(editor),
			client,
			pageId,
			pageTags,
			readOnly
		)

		// Hand the flush up to whoever holds the publisher. Both debounces, not just
		// the block writes: publishing reads `p/*` as well as `b/*`, and the tag
		// debounce is the longer of the two. Each `flush` is a stable ref into its own
		// live sync effect, so this indirection survives a page switch; the reset on
		// unmount is what stops a publish from calling into a torn down editor's
		// closure.
		React.useEffect(() => {
			if (!syncFlushRef) return
			syncFlushRef.current = () => {
				flush.current()
				tagFlush.current()
			}
			return () => {
				syncFlushRef.current = () => {}
			}
		}, [syncFlushRef, flush, tagFlush])

		// Lock management — pure state hook, no subscription
		const { locks, handleLockEvent } = useBlockLocks(pageId)
		const _localLockedBlockRef = useEditorLocks(asBaseEditor(editor), client, userId)

		// Presence: tell peers which page and block we are on, and read back where
		// they are. Independent of the locks above — a read-only viewer publishes
		// presence and can never take a lock.
		usePresencePublisher(asBaseEditor(editor), presence, pageId)
		const { entries } = usePresence()
		const blockPeers = React.useMemo(() => {
			const peers = new Map<string, BlockPeer>()
			// `entries`, not `users`: it is a CONNECTION that has a caret somewhere,
			// so the same person in two tabs marks two blocks. Everything read out of
			// `state` is peer-published and unvalidated — hence the type checks.
			for (const entry of entries) {
				if (entry.self || entry.state?.page !== pageId) continue
				const block = entry.state?.block
				if (typeof block !== 'string' || !block) continue
				peers.set(block, {
					name: entry.name || entry.idTag || t('Guest'),
					hue: entry.hue
				})
			}
			return peers
		}, [entries, pageId, t])
		useLockIndicators(asBaseEditor(editor), locks, blockPeers)

		// One published page is enough: whatever is inserted from here can land on a
		// page an anonymous reader fetches, so the pickers must refuse anything that
		// is not Public. `pubAt` is projected by `PAGE_FIELDS` for exactly this.
		const isSiteSource = React.useMemo(() => {
			for (const page of pages.values()) {
				if (page.publishedAt) return true
			}
			return false
		}, [pages])

		// MediaPicker integration for image/video/audio insertion
		const { getSlashMenuItems } = useMediaHandler({
			editor: editor as NotilloEditorType,
			ownerTag,
			documentFileId: fileId,
			isSiteSource,
			readOnly
		})

		// RTDB changes → Editor (lock events forwarded to handleLockEvent)
		useRtdbToEditor(
			asBaseEditor(editor),
			client,
			pageId,
			userId,
			ownerTag,
			recentLocalUpdates,
			blockStates,
			handleLockEvent
		)

		// Track editor container width for image variant selection
		const editorRef = React.useRef<HTMLDivElement>(null)
		React.useEffect(() => {
			const el = editorRef.current
			if (!el) return

			const ro = new ResizeObserver(([entry]) => {
				if (entry) containerWidthRef.current = entry.contentRect.width
			})
			ro.observe(el)
			return () => ro.disconnect()
		}, [])

		// Lives here rather than in the app: the element remounts per page
		// (`key={activePageId}`), and the hook only attaches on mount / base change.
		useReflowViewReport(
			embedded ? editorRef : NO_ELEMENT,
			embedded
				? {
						nav: pageId,
						viewId: pageId,
						named: true,
						title: embedTitle,
						a11yLabel: embedTitle
							? t('Page "{{title}}"', { title: embedTitle })
							: undefined
					}
				: {}
		)

		// Wiki-link click handling via event delegation
		React.useEffect(() => {
			const el = editorRef.current
			if (!el) return

			function handleClick(e: MouseEvent) {
				const target = e.target as HTMLElement

				// Regular hyperlinks rendered by BlockNote's default link
				// mark. BlockNote/Tiptap's Link extension opens links on
				// click by default, which on touch / plain-click in edit
				// mode prevents the caret from landing inside the text.
				// We intercept in capture phase and stop propagation so
				// BlockNote never sees the event. In edit mode + plain
				// click the cursor placement is handled by ProseMirror's
				// mousedown (which already fired); the click is swallowed
				// so no navigation happens. Cmd/Ctrl/middle-click, and
				// any click in read-only mode, open the link in a new
				// tab (the app is in a sandboxed iframe, so same-tab
				// navigation would replace the whole app).
				const anchor = target.closest('a[href]') as HTMLAnchorElement | null
				if (anchor && el?.contains(anchor)) {
					// Middle-click dispatches `auxclick`, not `click`, so
					// only metaKey/ctrlKey are reachable here.
					const modifier = e.metaKey || e.ctrlKey
					e.preventDefault()
					e.stopPropagation()
					if (readOnly || modifier) {
						window.open(anchor.href, '_blank', 'noopener,noreferrer')
					}
					return
				}

				// One delegated handler for every in-document page reference: an
				// inline wiki link and a row of an `index` block navigate the same way
				// and carry the same `data-page-id`.
				const wikiLink = target.closest(
					'.notillo-wiki-link, .notillo-index-link'
				) as HTMLElement | null
				if (wikiLink) {
					const targetPageId = wikiLink.dataset.pageId
					if (targetPageId) {
						onSelectPage(targetPageId)
					}
					return
				}

				const tag = target.closest('.notillo-tag') as HTMLElement | null
				if (tag) {
					const tagName = tag.dataset.tag
					if (tagName) onTagClick?.(tagName)
				}
			}

			function handleAuxClick(e: MouseEvent) {
				if (e.button !== 1) return
				const target = e.target as HTMLElement
				const anchor = target.closest('a[href]') as HTMLAnchorElement | null
				if (anchor && el?.contains(anchor)) {
					e.preventDefault()
					e.stopPropagation()
					window.open(anchor.href, '_blank', 'noopener,noreferrer')
				}
			}

			// Attach on `window` in capture phase so we run before any
			// listener inside the editor (ProseMirror/Tiptap). `el.contains`
			// scopes the handler to events originating inside this editor.
			window.addEventListener('click', handleClick, true)
			window.addEventListener('auxclick', handleAuxClick, true)
			return () => {
				window.removeEventListener('click', handleClick, true)
				window.removeEventListener('auxclick', handleAuxClick, true)
			}
		}, [onSelectPage, onTagClick, readOnly])

		// Backed by the same matcher the sidebar and command palette use, so
		// `@`/`[[` see every page — including collapsed-branch and unfiled ones —
		// and fold diacritics alike.
		const getWikiLinkItems = React.useCallback(
			(query: string): DefaultReactSuggestionItem[] => {
				const search = query.trim()

				function linkItem(id: string, title: string, icon?: string) {
					const pageTitle = title || t('Untitled')
					return {
						title: pageTitle,
						icon: icon ? <span>{icon}</span> : undefined,
						onItemClick: () => {
							editor.insertInlineContent([
								{ type: 'wikiLink', props: { pageId: id, pageTitle } },
								' '
							])
						}
					}
				}

				const items: DefaultReactSuggestionItem[] = search
					? // One over the limit, because the current page is filtered out
						// afterwards: asking for exactly the limit returns one suggestion
						// short whenever the edited page ranks among its own matches.
						searchPages({ pages, query: search, limit: WIKI_LINK_SUGGESTION_LIMIT + 1 })
							.filter((r) => r.id !== pageId)
							.slice(0, WIKI_LINK_SUGGESTION_LIMIT)
							.map((r) => linkItem(r.id, r.title, r.icon))
					: Array.from(pages.values())
							.filter((p) => p.id !== pageId)
							.sort((a, b) => a.title.localeCompare(b.title))
							.slice(0, WIKI_LINK_SUGGESTION_LIMIT)
							.map((p) => linkItem(p.id, p.title, p.icon))

				// A page created from here has no parent — it lives outside the
				// sidebar until it is pinned.
				if (items.length === 0 && search) {
					items.push({
						title: t('Create page "{{search}}"', { search }),
						onItemClick: () => {
							void (async () => {
								const id = await createPage(client, userId, search)
								editor.insertInlineContent([
									{ type: 'wikiLink', props: { pageId: id, pageTitle: search } },
									' '
								])
							})()
						}
					})
				}

				return items
			},
			[editor, client, userId, pages, pageId, t]
		)

		// Tag suggestion items
		const getTagItems = React.useCallback(
			(query: string): DefaultReactSuggestionItem[] => {
				// Folding is for *matching* only: the created tag keeps the user's
				// accents, since folding it would rewrite `#keresés` to `#kereses`
				// in their data.
				const raw = query.trim()
				const folded = foldDiacritics(raw)
				const items: DefaultReactSuggestionItem[] = []

				for (const tag of tags) {
					if (folded && !foldDiacritics(tag).includes(folded)) continue
					items.push({
						title: `#${tag}`,
						onItemClick: () => {
							editor.insertInlineContent([{ type: 'tag', props: { tag } }, ' '])
						}
					})
				}

				// Offer to create a new tag unless one already exists that only differs
				// by accents or case — otherwise "Create" sits right under the tag it
				// would near-duplicate.
				const exists =
					!!folded && Array.from(tags).some((tag) => foldDiacritics(tag) === folded)
				if (raw && !exists) {
					// Label with the tag that will actually be created, not the raw
					// query — otherwise "Create #Keresés" quietly inserts `#keresés`.
					const newTag = raw.toLowerCase()
					items.push({
						title: t('Create #{{search}}', { search: newTag }),
						onItemClick: () => {
							editor.insertInlineContent([
								{ type: 'tag', props: { tag: newTag } },
								' '
							])
						}
					})
				}

				return items
			},
			[editor, tags, t]
		)

		// Custom DragHandleMenu with "Comment on block" item
		const customDragHandleMenu = React.useMemo(() => {
			if (!onCommentBlock) return undefined
			return function NotilloDragHandleMenu() {
				return (
					<DragHandleMenu>
						<RemoveBlockItem>{t('Delete')}</RemoveBlockItem>
						<BlockColorsItem>{t('Colors')}</BlockColorsItem>
						<CommentBlockMenuItem onCommentBlock={onCommentBlock}>
							{t('Comment')}
						</CommentBlockMenuItem>
					</DragHandleMenu>
				)
			}
		}, [onCommentBlock, t])

		const customSideMenu = React.useMemo(() => {
			if (!customDragHandleMenu) return undefined
			return function NotilloSideMenu() {
				return <SideMenu dragHandleMenu={customDragHandleMenu} />
			}
		}, [customDragHandleMenu])

		// The stock toolbar plus the `index` block's settings controls, which render
		// themselves away unless a single `index` block is selected. Memoised like the
		// side menu above: a component identity that changed every render would
		// re-render `BlockNoteView` mid-transaction, which is what this file's
		// `React.memo` comparator exists to prevent.
		const customFormattingToolbar = React.useMemo(() => {
			return function NotilloFormattingToolbar() {
				return (
					<FormattingToolbar>
						{[
							...getFormattingToolbarItems(),
							<IndexToolbarItems key="indexToolbarItems" />
						]}
					</FormattingToolbar>
				)
			}
		}, [])

		/**
		 * `pages` as `selectListing`'s input, once per snapshot.
		 *
		 * Built here rather than in `PageIndex` so K listing blocks share one array —
		 * and `selectListing` can memoize its parent→children index on the array's
		 * identity, which the per-block version defeated. `useAllPages` keeps the map
		 * identity stable between snapshots, so this recomputes only on a real change.
		 */
		const listingPages = React.useMemo(() => {
			const listing: ListingPage[] = []
			for (const page of pages.values()) {
				listing.push({
					pageId: page.id,
					title: page.title,
					// The resolved parent, never the stored one, and never omitted:
					// `selectListing` buckets by this key on both sides, so passing
					// `pp` raw put a top-level page in a bucket no published listing
					// looks in — and dropped an unfiled page out of every listing here.
					parentId: listingParentId(page.id, page.parentPageId, homePageId),
					order: page.order,
					...(page.tags?.length && { tags: page.tags }),
					...(page.publishedAt !== undefined && { date: page.publishedAt })
				})
			}
			return listing
		}, [pages, homePageId])

		// Memoised: every consumer — each `index` block, every wiki link, every tag,
		// the index toolbar — re-renders when this value's identity changes, and an
		// object literal changes it on every render of this component.
		const editorContext = React.useMemo(
			() => ({
				pages,
				listingPages,
				sourceFileId: fileId,
				pageId,
				ownerTag,
				token,
				homePageId,
				canWrite
			}),
			[pages, listingPages, fileId, pageId, ownerTag, token, homePageId, canWrite]
		)

		return (
			<div
				ref={editorRef}
				className="notillo-editor"
				style={
					embedded
						? {
								...(notilloThemeOverrides as React.CSSProperties),
								// Content height, not the container's: the frame grows to it.
								flex: 'none',
								fontSize: textScale ? `${textScale * 100}%` : undefined
							}
						: (notilloThemeOverrides as React.CSSProperties)
				}
			>
				<NotilloEditorProvider value={editorContext}>
					<BlockNoteView
						editor={editor}
						editable={!readOnly}
						theme={darkMode ? 'dark' : 'light'}
						slashMenu={false}
						filePanel={false}
						formattingToolbar={false}
						sideMenu={!customSideMenu}
					>
						{customSideMenu && <SideMenuController sideMenu={customSideMenu} />}
						<FormattingToolbarController formattingToolbar={customFormattingToolbar} />
						<SuggestionMenuController
							triggerCharacter="/"
							getItems={async (query) =>
								filterSuggestionItems(
									getSlashMenuItems(editor as NotilloEditorType),
									query
								)
							}
						/>
						<SuggestionMenuController
							triggerCharacter="@"
							getItems={async (query) => getWikiLinkItems(query)}
						/>
						<SuggestionMenuController
							triggerCharacter={WIKI_LINK_TRIGGER}
							getItems={async (query) => getWikiLinkItems(query)}
						/>
						<SuggestionMenuController
							triggerCharacter="#"
							getItems={async (query) => getTagItems(query)}
						/>
					</BlockNoteView>
				</NotilloEditorProvider>
			</div>
		)
	},
	(prev, next) => {
		// Only re-render when behaviorally relevant props change.
		// initialBlocks, knownBlockIds, knownBlockOrders are only used during initial
		// mount (useCreateBlockNote and useDocumentSync's first useEffect run) —
		// re-renders for these would cause BlockNoteView to re-render mid-transaction,
		// which can create ghost blocks during drag-drop.
		return (
			prev.client === next.client &&
			prev.presence === next.presence &&
			prev.pageId === next.pageId &&
			prev.readOnly === next.readOnly &&
			prev.canWrite === next.canWrite &&
			prev.userId === next.userId &&
			prev.ownerTag === next.ownerTag &&
			prev.token === next.token &&
			prev.darkMode === next.darkMode &&
			prev.fileId === next.fileId &&
			prev.pages === next.pages &&
			prev.homePageId === next.homePageId &&
			prev.tags === next.tags &&
			prev.onCommentBlock === next.onCommentBlock &&
			prev.embedded === next.embedded &&
			prev.embedTitle === next.embedTitle &&
			prev.textScale === next.textScale
		)
	}
)

// vim: ts=4
