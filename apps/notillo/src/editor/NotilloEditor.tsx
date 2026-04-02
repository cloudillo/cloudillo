// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { type Block, UniqueID } from '@blocknote/core'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import {
	useCreateBlockNote,
	useExtensionState,
	useComponentsContext,
	SuggestionMenuController,
	SideMenuController,
	SideMenu,
	DragHandleMenu,
	RemoveBlockItem,
	BlockColorsItem,
	type DefaultReactSuggestionItem
} from '@blocknote/react'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'

import { getFileUrl, getImageVariantForDisplaySize } from '@cloudillo/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { createPage } from '../rtdb/page-ops.js'
import { NotilloEditorProvider } from './NotilloEditorContext.js'
import { notilloSchema, asBaseEditor, type NotilloEditor as NotilloEditorType } from './schema.js'
import { notilloThemeOverrides } from './theme.js'
import { shortId } from '../rtdb/ids.js'
import { useDocumentSync, useRtdbToEditor } from '../hooks/useEditorSync.js'
import { useEditorLocks } from '../hooks/useEditorLocks.js'
import { useBlockLocks } from '../hooks/useBlockLocks.js'
import { useLockIndicators } from '../hooks/useLockIndicators.js'
import { usePageTagSync } from '../hooks/usePageTagSync.js'
import { useMediaHandler } from './useMediaHandler.js'

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
	pageId: string
	initialBlocks: Block[]
	knownBlockIds: Set<string>
	knownBlockOrders: Map<string, number>
	readOnly: boolean
	userId: string
	ownerTag: string
	token?: string
	darkMode: boolean
	fileId?: string
	pages: Map<string, PageRecord & { id: string }>
	onSelectPage: (pageId: string) => void
	onTagClick?: (tag: string) => void
	onEditorReady?: (editor: NotilloEditorType) => void
	onCommentBlock?: (blockId: string) => void
	tags: Set<string>
	pageTags?: string[]
}

export const NotilloEditor = React.memo(
	function NotilloEditor({
		client,
		pageId,
		initialBlocks,
		knownBlockIds,
		knownBlockOrders,
		readOnly,
		userId,
		ownerTag,
		token,
		darkMode,
		fileId,
		pages,
		onSelectPage,
		onTagClick,
		onEditorReady,
		onCommentBlock,
		tags,
		pageTags
	}: NotilloEditorProps) {
		const { t } = useTranslation()
		const containerWidthRef = React.useRef(900)

		const resolveFileUrl = React.useCallback(
			async (url: string) => {
				if (!url.startsWith('cl-file:')) return url

				const rest = url.slice(8) // after "cl-file:"
				const colonIdx = rest.indexOf(':')

				// Typed URL: cl-file:img:FILEID, cl-file:vid:FILEID, cl-file:aud:FILEID
				if (colonIdx !== -1) {
					const tag = rest.slice(0, colonIdx)
					const fileId = rest.slice(colonIdx + 1)

					if (tag === 'img') {
						const px = containerWidthRef.current * (globalThis.devicePixelRatio || 1)
						return getFileUrl(
							ownerTag,
							fileId,
							getImageVariantForDisplaySize(px, px),
							token ? { token } : undefined
						)
					}
					if (tag === 'vid') {
						return getFileUrl(ownerTag, fileId, 'vid.hd', token ? { token } : undefined)
					}
					// 'aud' or unknown tag — no variant
					return getFileUrl(ownerTag, fileId, undefined, token ? { token } : undefined)
				}

				// Legacy untyped URL: cl-file:FILEID — treat as image for backward compat
				const px = containerWidthRef.current * (globalThis.devicePixelRatio || 1)
				return getFileUrl(
					ownerTag,
					rest,
					getImageVariantForDisplaySize(px, px),
					token ? { token } : undefined
				)
			},
			[ownerTag, token]
		)

		const editor = useCreateBlockNote({
			schema: notilloSchema,
			// biome-ignore lint/suspicious/noExplicitAny: BlockNote initialContent type boundary with custom schema
			initialContent: initialBlocks.length > 0 ? (initialBlocks as any) : undefined,
			resolveFileUrl
		})

		const onEditorReadyRef = React.useRef(onEditorReady)
		React.useEffect(() => {
			onEditorReadyRef.current = onEditorReady
		})
		React.useEffect(() => {
			onEditorReadyRef.current?.(editor)
		}, [editor])

		// Local changes → RTDB (smart per-block sync with position tracking)
		const { recentLocalUpdates, blockStates } = useDocumentSync(
			asBaseEditor(editor),
			client,
			pageId,
			userId,
			ownerTag,
			readOnly,
			knownBlockIds,
			knownBlockOrders
		)

		// Lock management — pure state hook, no subscription
		const { locks, handleLockEvent } = useBlockLocks(pageId)
		const _localLockedBlockRef = useEditorLocks(asBaseEditor(editor), client, userId)
		useLockIndicators(asBaseEditor(editor), locks)

		// Editor → page tag sync (debounced, self-healing)
		usePageTagSync(asBaseEditor(editor), client, pageId, pageTags, readOnly)

		// MediaPicker integration for image/video/audio insertion
		const { getSlashMenuItems } = useMediaHandler({
			editor: editor as NotilloEditorType,
			ownerTag,
			documentFileId: fileId,
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

		// Wiki-link click handling via event delegation
		React.useEffect(() => {
			const el = editorRef.current
			if (!el) return

			function handleClick(e: MouseEvent) {
				const target = e.target as HTMLElement

				const wikiLink = target.closest('.notillo-wiki-link') as HTMLElement | null
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

			el.addEventListener('click', handleClick)
			return () => el.removeEventListener('click', handleClick)
		}, [onSelectPage, onTagClick])

		// Wiki-link suggestion items
		const getWikiLinkItems = React.useCallback(
			(query: string): DefaultReactSuggestionItem[] => {
				const search = query.toLowerCase()

				const items: DefaultReactSuggestionItem[] = []
				for (const page of pages.values()) {
					if (page.id === pageId) continue // Don't suggest current page
					if (search && !page.title.toLowerCase().includes(search)) continue
					items.push({
						title: page.title || t('Untitled'),
						icon: page.icon ? <span>{page.icon}</span> : undefined,
						onItemClick: () => {
							editor.insertInlineContent([
								{
									type: 'wikiLink',
									props: {
										pageId: page.id,
										pageTitle: page.title || t('Untitled')
									}
								},
								' '
							])
						}
					})
				}

				// Offer to create a new page if no matches found
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
				const search = query.toLowerCase()
				const items: DefaultReactSuggestionItem[] = []

				for (const tag of tags) {
					if (search && !tag.toLowerCase().includes(search)) continue
					items.push({
						title: `#${tag}`,
						onItemClick: () => {
							editor.insertInlineContent([{ type: 'tag', props: { tag } }, ' '])
						}
					})
				}

				// Offer to create a new tag if the query doesn't match any existing tag
				if (search && !tags.has(search)) {
					items.push({
						title: t('Create #{{search}}', { search }),
						onItemClick: () => {
							editor.insertInlineContent([
								{ type: 'tag', props: { tag: search } },
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

		return (
			<div
				ref={editorRef}
				className="notillo-editor"
				style={notilloThemeOverrides as React.CSSProperties}
			>
				<NotilloEditorProvider value={{ pages, sourceFileId: fileId }}>
					<BlockNoteView
						editor={editor}
						editable={!readOnly}
						theme={darkMode ? 'dark' : 'light'}
						slashMenu={false}
						filePanel={false}
						sideMenu={!customSideMenu}
					>
						{customSideMenu && <SideMenuController sideMenu={customSideMenu} />}
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
			prev.pageId === next.pageId &&
			prev.readOnly === next.readOnly &&
			prev.userId === next.userId &&
			prev.ownerTag === next.ownerTag &&
			prev.token === next.token &&
			prev.darkMode === next.darkMode &&
			prev.fileId === next.fileId &&
			prev.pages === next.pages &&
			prev.tags === next.tags &&
			prev.onCommentBlock === next.onCommentBlock
		)
	}
)

// vim: ts=4
