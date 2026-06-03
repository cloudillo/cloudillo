// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	type BlockNoteEditor,
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs
} from '@blocknote/core'

import { DocumentEmbed } from './DocumentEmbed.js'
import { Tag } from './Tag.js'
import { WikiLink } from './WikiLink.js'

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
