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

import type { Block } from '@blocknote/core'
import type { InlineContent } from '../rtdb/types.js'

export function extractTagsFromBlocks(blocks: Block[]): string[] {
	const tags = new Set<string>()

	function visitBlock(block: Block) {
		const content = block.content as InlineContent[] | undefined
		if (content) {
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
