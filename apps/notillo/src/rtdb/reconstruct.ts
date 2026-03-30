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
import {
	type BlockRecord,
	TABLE_TYPES,
	MEDIA_TYPES,
	isTableContent,
	asBlockType,
	asBlockContent
} from './types.js'

export function reconstructBlocks(records: Map<string, BlockRecord & { id: string }>): Block[] {
	// Group by parent
	const childrenOf = new Map<string | undefined, Array<BlockRecord & { id: string }>>()

	for (const [, record] of records) {
		const parentId = record.parentBlockId ?? undefined // normalize null → undefined
		if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
		childrenOf.get(parentId)!.push(record)
	}

	// Sort each group by order
	for (const children of childrenOf.values()) {
		children.sort((a, b) => a.order - b.order)
	}

	// Recursive build
	// Note: block type and content are already expanded by fromStoredBlock
	function buildTree(parentId: string | undefined): Block[] {
		const children = childrenOf.get(parentId) || []
		const result: Block[] = []
		for (const record of children) {
			const content = record.content ? asBlockContent(record.content) : undefined
			const hasArrayContent = Array.isArray(content) && content.length > 0
			// Skip corrupted table blocks that lost their structured content
			if (TABLE_TYPES.has(record.type) && !isTableContent(content)) continue

			// Media blocks use props (url, name, etc.) — skip only if both props and content are missing
			if (MEDIA_TYPES.has(record.type) && !record.props && !record.content) continue

			result.push({
				id: record.id,
				type: asBlockType(record.type),
				props: record.props || {},
				...(hasArrayContent || isTableContent(content) ? { content } : {}),
				children: buildTree(record.id)
			} as Block)
		}
		return result
	}

	return buildTree(undefined)
}

// vim: ts=4
