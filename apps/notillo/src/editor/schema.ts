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

import {
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs,
	type BlockNoteEditor
} from '@blocknote/core'
import { WikiLink } from './WikiLink.js'
import { Tag } from './Tag.js'
import { DocumentEmbed } from './DocumentEmbed.js'

export const notilloSchema = BlockNoteSchema.create({
	blockSpecs: {
		...defaultBlockSpecs,
		documentEmbed: DocumentEmbed
	},
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		wikiLink: WikiLink,
		tag: Tag
	}
})

export type NotilloEditor = typeof notilloSchema.BlockNoteEditor

export function asBaseEditor(editor: NotilloEditor): BlockNoteEditor {
	// biome-ignore lint/suspicious/noExplicitAny: BlockNote schema-specific editor → generic base type boundary
	return editor as any
}

// vim: ts=4
