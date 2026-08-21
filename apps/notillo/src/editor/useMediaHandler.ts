// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { getAppBus, type MediaFileResolvedPush } from '@cloudillo/core'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	RiFileLine,
	RiFilmLine,
	RiImage2Fill,
	RiListUnordered,
	RiVolumeUpFill
} from 'react-icons/ri'

import type { NotilloEditor } from './schema.js'

function updateBlockUnsafe(
	editor: NotilloEditor,
	blockId: string,
	update: Record<string, unknown>
) {
	// biome-ignore lint/suspicious/noExplicitAny: BlockNote schema boundary — custom block types/props not expressible in generic updateBlock signature
	editor.updateBlock(blockId, update as any)
}

interface UseMediaHandlerOptions {
	editor: NotilloEditor
	ownerTag: string
	documentFileId?: string
	/**
	 * This document has published pages, so anything inserted here can end up on a
	 * page fetched by an anonymous reader: only Public files may be picked, and the
	 * picker's fix action is "Make public" rather than a share.
	 */
	isSiteSource?: boolean
	readOnly: boolean
}

type MediaTag = 'img' | 'vid' | 'aud'

export function useMediaHandler({
	documentFileId,
	isSiteSource,
	readOnly
}: UseMediaHandlerOptions) {
	const { t } = useTranslation()

	// Track temp file ID -> block ID mapping for resolution
	const pendingTempIdsRef = React.useRef(
		new Map<string, { editor: NotilloEditor; blockId: string; mediaTag: MediaTag }>()
	)

	// Listen for file ID resolution messages
	React.useEffect(() => {
		const bus = getAppBus()

		const handleFileResolved = (msg: MediaFileResolvedPush) => {
			const { tempId, finalId } = msg.payload
			const pending = pendingTempIdsRef.current.get(tempId)

			if (pending) {
				// Temp ID resolved to final ID
				updateBlockUnsafe(pending.editor, pending.blockId, {
					props: { url: `cl-file:${pending.mediaTag}:${finalId}` }
				})
				pendingTempIdsRef.current.delete(tempId)
			}
		}

		bus.on('media:file.resolved', handleFileResolved)

		return () => {
			bus.off('media:file.resolved', handleFileResolved)
			pendingTempIdsRef.current.clear()
		}
	}, [])

	const getSlashMenuItems = React.useCallback(
		(ed: NotilloEditor): DefaultReactSuggestionItem[] => {
			const defaults = getDefaultReactSlashMenuItems(ed)

			// Filter out built-in media items
			const filtered = defaults.filter(
				(item) =>
					item.title !== 'Image' &&
					item.title !== 'Video' &&
					item.title !== 'Audio' &&
					item.title !== 'File'
			)

			if (readOnly) return filtered

			const makeMediaItem = (
				title: string,
				icon: React.ReactElement,
				blockType: string,
				mediaType: string,
				mediaTag: MediaTag,
				aliases: string[],
				group: string
			): DefaultReactSuggestionItem => ({
				title,
				icon,
				aliases,
				group,
				onItemClick: () => {
					const blockId = ed.getTextCursorPosition().block.id

					void (async () => {
						try {
							const bus = getAppBus()
							const result = await bus.pickMedia({
								mediaType,
								documentFileId,
								// A published page is served to an anonymous reader, so
								// the document's own visibility is not the bar — 'P' is.
								documentVisibility: isSiteSource ? 'P' : undefined,
								requirePublic: isSiteSource,
								title: t('Insert {{title}}', { title })
							})

							if (!result) return

							updateBlockUnsafe(ed, blockId, {
								type: blockType,
								props: { url: `cl-file:${mediaTag}:${result.fileId}` }
							})

							if (result.fileId.startsWith('@')) {
								pendingTempIdsRef.current.set(result.fileId, {
									editor: ed,
									blockId,
									mediaTag
								})
							}
						} catch (err) {
							console.error(`[MediaHandler] Failed to insert ${title}:`, err)
						}
					})()
				}
			})

			filtered.push(
				makeMediaItem(
					'Image',
					React.createElement(RiImage2Fill, { size: 18 }),
					'image',
					'image/*',
					'img',
					['picture', 'photo', 'img'],
					'Media'
				),
				makeMediaItem(
					'Video',
					React.createElement(RiFilmLine, { size: 18 }),
					'video',
					'video/*',
					'vid',
					['movie', 'clip'],
					'Media'
				),
				makeMediaItem(
					'Audio',
					React.createElement(RiVolumeUpFill, { size: 18 }),
					'audio',
					'audio/*',
					'aud',
					['sound', 'music'],
					'Media'
				)
			)

			// A page listing. `title`, `aliases` and `group` stay English on purpose:
			// they are what `filterSuggestionItems` matches the typed query against,
			// the same as every item above.
			filtered.push({
				title: 'Index',
				icon: React.createElement(RiListUnordered, { size: 18 }),
				aliases: ['list', 'children', 'toc'],
				group: 'Basic blocks',
				onItemClick: () => {
					const blockId = ed.getTextCursorPosition().block.id
					// Empty props: every knob has a schema default, and writing them
					// out would freeze today's defaults into every block ever inserted.
					updateBlockUnsafe(ed, blockId, { type: 'index', props: {} })
					// Select it, so its settings button is on screen at once: the
					// formatting toolbar only shows for a non-empty selection.
					ed.setSelection(blockId, blockId)
				}
			})

			// Document embed item
			filtered.push({
				title: 'Document',
				icon: React.createElement(RiFileLine, { size: 18 }),
				aliases: ['embed', 'doc'],
				group: 'Media',
				onItemClick: () => {
					const blockId = ed.getTextCursorPosition().block.id

					void (async () => {
						try {
							const bus = getAppBus()
							const result = await bus.pickDocument({
								sourceFileId: documentFileId,
								// Embedding is not mounting: the reader gets the live
								// document, so it has to be Public in its own right.
								requirePublic: isSiteSource,
								title: t('Embed Document')
							})

							if (!result) return

							updateBlockUnsafe(ed, blockId, {
								type: 'documentEmbed',
								props: {
									fileId: result.fileId,
									contentType: result.contentType,
									appId: result.appId || ''
								}
							})
						} catch (err) {
							console.error('[MediaHandler] Failed to embed document:', err)
						}
					})()
				}
			})

			return filtered
		},
		[readOnly, documentFileId, isSiteSource, t]
	)

	return { getSlashMenuItems }
}

// vim: ts=4
