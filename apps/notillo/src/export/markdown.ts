import type { NotilloEditor } from '../editor/schema.js'
import { downloadBlob } from './download.js'

export async function exportMarkdown(editor: NotilloEditor, title: string) {
	const md = await editor.blocksToMarkdownLossy(editor.document)
	const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
	downloadBlob(blob, `${title}.md`)
}

export async function importMarkdown(editor: NotilloEditor, markdown: string) {
	const blocks = await editor.tryParseMarkdownToBlocks(markdown)
	editor.replaceBlocks(editor.document, blocks)
}

// vim: ts=4
