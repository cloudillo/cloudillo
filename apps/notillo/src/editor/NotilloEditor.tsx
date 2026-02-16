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

import type { Block } from '@blocknote/core'
import {
	useCreateBlockNote,
	SuggestionMenuController,
	type DefaultReactSuggestionItem
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'

import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { createPage } from '../rtdb/page-ops.js'
import { NotilloEditorProvider } from './NotilloEditorContext.js'
import { notilloSchema } from './schema.js'
import { notilloThemeOverrides } from './theme.js'
import { shortId } from '../rtdb/ids.js'
import { useDocumentSync, useRtdbToEditor } from '../hooks/useEditorSync.js'
import { useEditorLocks } from '../hooks/useEditorLocks.js'
import { useBlockLocks } from '../hooks/useBlockLocks.js'
import { useLockIndicators } from '../hooks/useLockIndicators.js'

interface NotilloEditorProps {
	client: RtdbClient
	pageId: string
	initialBlocks: Block[]
	knownBlockIds: Set<string>
	knownBlockOrders: Map<string, number>
	readOnly: boolean
	userId: string
	darkMode: boolean
	pages: Map<string, PageRecord & { id: string }>
	onSelectPage: (pageId: string) => void
	onTagClick?: (tag: string) => void
	tags: Set<string>
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
		darkMode,
		pages,
		onSelectPage,
		onTagClick,
		tags
	}: NotilloEditorProps) {
		const editor = useCreateBlockNote({
			schema: notilloSchema,
			initialContent: initialBlocks.length > 0 ? (initialBlocks as any) : undefined,
			idFactory: shortId
		})

		// Local changes → RTDB (smart per-block sync with position tracking)
		const { recentLocalUpdates, blockStates } = useDocumentSync(
			editor as any,
			client,
			pageId,
			userId,
			readOnly,
			knownBlockIds,
			knownBlockOrders
		)

		// Lock management — pure state hook, no subscription
		const { locks, handleLockEvent } = useBlockLocks(pageId)
		const localLockedBlockRef = useEditorLocks(editor as any, client, userId)
		useLockIndicators(editor as any, locks)

		// RTDB changes → Editor (lock events forwarded to handleLockEvent)
		useRtdbToEditor(
			editor as any,
			client,
			pageId,
			userId,
			recentLocalUpdates,
			blockStates,
			handleLockEvent
		)

		// Wiki-link click handling via event delegation
		const editorRef = React.useRef<HTMLDivElement>(null)
		React.useEffect(() => {
			const el = editorRef.current
			if (!el) return

			function handleClick(e: MouseEvent) {
				const target = e.target as HTMLElement

				const wikiLink = target.closest('.notillo-wiki-link') as HTMLElement | null
				if (wikiLink) {
					const targetPageId = wikiLink.dataset.pageId
					if (targetPageId && pages.has(targetPageId)) {
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
		}, [pages, onSelectPage, onTagClick])

		// Wiki-link suggestion items
		const getWikiLinkItems = React.useCallback(
			(query: string): DefaultReactSuggestionItem[] => {
				const search = query.toLowerCase()

				const items: DefaultReactSuggestionItem[] = []
				for (const page of pages.values()) {
					if (page.id === pageId) continue // Don't suggest current page
					if (search && !page.title.toLowerCase().includes(search)) continue
					items.push({
						title: page.title || 'Untitled',
						icon: page.icon ? <span>{page.icon}</span> : undefined,
						onItemClick: () => {
							editor.insertInlineContent([
								{
									type: 'wikiLink',
									props: { pageId: page.id, pageTitle: page.title || 'Untitled' }
								},
								' '
							])
						}
					})
				}

				// Offer to create a new page if no matches found
				if (items.length === 0 && search) {
					items.push({
						title: `Create page "${search}"`,
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
			[editor, client, userId, pages, pageId]
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
						title: `Create #${search}`,
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
			[editor, tags]
		)

		return (
			<div
				ref={editorRef}
				className="notillo-editor"
				style={notilloThemeOverrides as React.CSSProperties}
			>
				<NotilloEditorProvider value={{ pages }}>
					<BlockNoteView
						editor={editor}
						editable={!readOnly}
						theme={darkMode ? 'dark' : 'light'}
					>
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
			prev.darkMode === next.darkMode &&
			prev.pages === next.pages &&
			prev.tags === next.tags
		)
	}
)

// vim: ts=4
