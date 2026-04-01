// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
