// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Block } from '@blocknote/core'
import type { InlineContent } from '../rtdb/types.js'

export function extractTagsFromBlocks(blocks: Block[]): string[] {
	const tags = new Set<string>()

	function visitBlock(block: Block) {
		const content = block.content as InlineContent[] | undefined
		if (Array.isArray(content)) {
			for (const item of content) {
				if (item.type === 'tag' && 'props' in item && item.props?.tag) {
					tags.add(item.props.tag)
				}
			}
		}
		if (block.children) {
			for (const child of block.children) {
				visitBlock(child)
			}
		}
	}

	for (const block of blocks) {
		visitBlock(block)
	}

	return [...tags].sort()
}

// vim: ts=4
