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

import type { BlockNoteEditor, Block } from '@blocknote/core'
import type { BlockRecord } from './types.js'

export function getParentBlockId(editor: BlockNoteEditor, blockId: string): string | undefined {
	const block = editor.getBlock(blockId)
	if (!block) return undefined

	const parent = editor.getParentBlock(block)
	return parent?.id
}

export function getBlockOrder(editor: BlockNoteEditor, blockId: string): number {
	const block = editor.getBlock(blockId)
	if (!block) return 0

	const parent = editor.getParentBlock(block)
	const siblings = parent ? parent.children || [] : editor.document

	const index = siblings.findIndex((b: Block) => b.id === blockId)
	return index >= 0 ? index + 1 : 0
}

export function blockToRecord(
	block: Block,
	pageId: string,
	userId: string,
	now: string
): BlockRecord {
	const parentBlockId = undefined // Set by caller based on editor context
	return {
		pageId,
		type: block.type,
		...(block.props && Object.keys(block.props).length > 0 && { props: block.props }),
		...(block.content &&
			Array.isArray(block.content) &&
			block.content.length > 0 && { content: block.content as any }),
		...(parentBlockId !== undefined && { parentBlockId }),
		order: 0, // Set by caller
		updatedAt: now,
		updatedBy: userId
	}
}

// vim: ts=4
