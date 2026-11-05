// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { NotilloEditor } from './schema.js'

/** The last block on screen: a collapsible block's children may be hidden, so it stops there. */
function lastBlock(editor: NotilloEditor) {
	let block = editor.document.at(-1)
	while (block?.children.length) {
		if (block.type === 'toggleListItem') break
		if ('isToggleable' in block.props && block.props.isToggleable === true) break
		block = block.children.at(-1)
	}
	return block
}

/**
 * Caret to the document's first or last block. An image or a table can only be
 * node-selected, and typing would replace it, so a new line opens next to it.
 */
export function focusDocumentEdge(editor: NotilloEditor, edge: 'start' | 'end') {
	const block = edge === 'start' ? editor.document[0] : lastBlock(editor)
	if (!block) return
	const target = Array.isArray(block.content)
		? block
		: editor.insertBlocks(
				[{ type: 'paragraph' }],
				block,
				edge === 'start' ? 'before' : 'after'
			)[0]
	if (!target) return
	editor.setTextCursorPosition(target, edge)
	editor.focus()
}

// vim: ts=4
