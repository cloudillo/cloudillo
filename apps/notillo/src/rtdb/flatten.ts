// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Block } from '@blocknote/core'
import { type BlockRecord, asBlockContent } from './types.js'
import { cleanProps, compactContent, compactBlockType } from './transform.js'

interface FlatBlock {
	id: string
	record: BlockRecord
}

export function flattenBlocks(
	blocks: Block[],
	pageId: string,
	parentBlockId: string | undefined,
	userId: string
): FlatBlock[] {
	const results: FlatBlock[] = []
	const now = new Date().toISOString()

	blocks.forEach((block, index) => {
		const props = cleanProps(block.props)
		const content = compactContent(asBlockContent(block.content))
		results.push({
			id: block.id,
			record: {
				pageId,
				type: compactBlockType(block.type),
				...(props !== undefined && { props }),
				...(content !== undefined && { content: asBlockContent(content) }),
				...(parentBlockId !== undefined && { parentBlockId }),
				order: index + 1,
				updatedAt: now,
				updatedBy: userId
			}
		})

		if (block.children && block.children.length > 0) {
			results.push(...flattenBlocks(block.children, pageId, block.id, userId))
		}
	})

	return results
}

// vim: ts=4
