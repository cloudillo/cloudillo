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
import { RiImage2Fill, RiFilmLine, RiVolumeUpFill } from 'react-icons/ri'

import { getAppBus, getFileUrl, type MediaFileResolvedPush } from '@cloudillo/core'
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'

import type { NotilloEditor } from './schema.js'

interface UseMediaHandlerOptions {
	editor: NotilloEditor
	ownerTag: string
	documentFileId?: string
	readOnly: boolean
}

type MediaTag = 'img' | 'vid' | 'aud'

// Track temp file ID -> block ID mapping for resolution
// Module-level since it needs to persist across re-renders
const pendingTempIds = new Map<
	string,
	{ editor: NotilloEditor; blockId: string; mediaTag: MediaTag }
>()

export function useMediaHandler({
	editor,
	ownerTag,
	documentFileId,
	readOnly
}: UseMediaHandlerOptions) {
	// Listen for file ID resolution messages
	React.useEffect(() => {
		const bus = getAppBus()

		const handleFileResolved = (msg: MediaFileResolvedPush) => {
			const { tempId, finalId } = msg.payload
			const pending = pendingTempIds.get(tempId)

			if (pending) {
				console.log('[MediaHandler] Resolving temp ID:', tempId, '->', finalId)
				pending.editor.updateBlock(pending.blockId, {
					props: { url: `cl-file:${pending.mediaTag}:${finalId}` } as any
				})
				pendingTempIds.delete(tempId)
			}
		}

		bus.on('media:file.resolved', handleFileResolved)

		return () => {
			bus.off('media:file.resolved')
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
								title: `Insert ${title}`
							})

							if (!result) return

							ed.updateBlock(blockId, {
								type: blockType as any,
								props: { url: `cl-file:${mediaTag}:${result.fileId}` } as any
							})

							if (result.fileId.startsWith('@')) {
								pendingTempIds.set(result.fileId, { editor: ed, blockId, mediaTag })
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

			return filtered
		},
		[readOnly, documentFileId]
	)

	return { getSlashMenuItems }
}

// vim: ts=4
