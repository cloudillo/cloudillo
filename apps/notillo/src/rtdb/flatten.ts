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
import type { BlockRecord } from './types.js'

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
		results.push({
			id: block.id,
			record: {
				pageId,
				type: block.type,
				...(block.props && Object.keys(block.props).length > 0 && { props: block.props }),
				...(block.content &&
					Array.isArray(block.content) &&
					block.content.length > 0 && { content: block.content as any }),
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
