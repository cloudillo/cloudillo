// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	type DefaultSuggestionItem,
	filterSuggestionItems,
	getDefaultSlashMenuItems
} from '@blocknote/core/extensions'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { getAppBus, type MediaFileResolvedPush } from '@cloudillo/core'
import {
	IcAudio,
	IcDocument,
	IcImage,
	IcList,
	IcListNumbers,
	IcText,
	IcVideo
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	IcBlockCheckList,
	IcBlockCode,
	IcBlockDivider,
	IcBlockEmoji,
	IcBlockHeading1,
	IcBlockHeading2,
	IcBlockHeading3,
	IcBlockHeading4,
	IcBlockHeading5,
	IcBlockHeading6,
	IcBlockQuote,
	IcBlockTable,
	IcBlockToggleList,
	IcTableOfContents
} from '../icons.js'
import { huIndexAliases } from './locales/hu.js'
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

type SlashKey = Exclude<DefaultSuggestionItem['key'], 'file'> | 'index' | 'document'
type SlashItem = DefaultReactSuggestionItem & { key: SlashKey }

/**
 * Each slash item's Phosphor icon, in menu order. The order has to keep a group's items
 * together: the menu prints a heading each time `group` changes, so a split group
 * repeats it. `paragraph` closes its group because new blocks already default to it.
 */
const SLASH_ICONS: Record<SlashKey, React.ComponentType<{ size?: number }>> = {
	heading: IcBlockHeading1,
	heading_2: IcBlockHeading2,
	heading_3: IcBlockHeading3,
	heading_4: IcBlockHeading4,
	heading_5: IcBlockHeading5,
	heading_6: IcBlockHeading6,
	toggle_heading: IcBlockHeading1,
	toggle_heading_2: IcBlockHeading2,
	toggle_heading_3: IcBlockHeading3,
	bullet_list: IcList,
	numbered_list: IcListNumbers,
	check_list: IcBlockCheckList,
	toggle_list: IcBlockToggleList,
	quote: IcBlockQuote,
	code_block: IcBlockCode,
	divider: IcBlockDivider,
	index: IcTableOfContents,
	paragraph: IcText,
	table: IcBlockTable,
	image: IcImage,
	video: IcVideo,
	audio: IcAudio,
	document: IcDocument,
	emoji: IcBlockEmoji
}

const SLASH_ORDER = Object.keys(SLASH_ICONS)

/** Built-ins that upload to BlockNote's file panel; Notillo inserts through the media picker. */
const BUILTIN_MEDIA: readonly string[] = ['image', 'video', 'audio', 'file']

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
		(ed: NotilloEditor, query: string): DefaultReactSuggestionItem[] => {
			const dict = ed.dictionary.slash_menu

			const items: SlashItem[] = getDefaultSlashMenuItems(ed).filter(
				(item): item is DefaultSuggestionItem & { key: SlashKey } =>
					!BUILTIN_MEDIA.includes(item.key)
			)

			const makeMediaItem = (
				key: 'image' | 'video' | 'audio',
				mediaType: string,
				mediaTag: MediaTag,
				aliases: string[]
			): SlashItem => ({
				...dict[key],
				key,
				aliases: [...dict[key].aliases, ...aliases],
				onItemClick: () => {
					const { title } = dict[key]
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
								type: key,
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

			if (!readOnly) {
				items.push(
					makeMediaItem('image', 'image/*', 'img', ['photo']),
					makeMediaItem('video', 'video/*', 'vid', ['movie', 'clip']),
					makeMediaItem('audio', 'audio/*', 'aud', ['music'])
				)

				// The dictionary's group, or it would be a group of its own in any other language.
				items.push({
					key: 'index',
					title: t('Index'),
					aliases: ['index', 'list', 'children', 'toc', ...huIndexAliases],
					group: dict.quote.group,
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

				items.push({
					key: 'document',
					title: t('Document'),
					aliases: ['embed', 'doc'],
					group: dict.image.group,
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
										appId: result.appId || '',
										name: result.fileName
									}
								})
							} catch (err) {
								console.error('[MediaHandler] Failed to embed document:', err)
							}
						})()
					}
				})
			}

			return (
				filterSuggestionItems(items, query)
					// The Subheadings group is exactly H4-H6 and the toggle headings,
					// which stay out of the way until searched for.
					.filter((item) => query || item.group !== dict.heading_4.group)
					.sort((a, b) => SLASH_ORDER.indexOf(a.key) - SLASH_ORDER.indexOf(b.key))
					.map((item) => ({
						...item,
						icon: React.createElement(SLASH_ICONS[item.key], { size: 24 })
					}))
			)
		},
		[readOnly, documentFileId, isSiteSource, t]
	)

	return { getSlashMenuItems }
}

// vim: ts=4
