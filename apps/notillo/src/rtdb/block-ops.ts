// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Block, BlockNoteEditor } from '@blocknote/core'

import { cleanProps, compactBlockType, compactContent } from './transform.js'
import { asBlockContent, type BlockRecord } from './types.js'

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
	const props = cleanProps(block.props)
	const content = compactContent(asBlockContent(block.content))
	return {
		pageId,
		type: compactBlockType(block.type),
		...(props !== undefined && { props }),
		...(content !== undefined && { content: asBlockContent(content) }),
		// parentBlockId set by caller based on editor context
		order: 0, // Set by caller
		updatedAt: now,
		updatedBy: userId
	}
}

// vim: ts=4
