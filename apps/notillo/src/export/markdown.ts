import type { NotilloEditor } from '../editor/schema.js'
import { downloadBlob } from './download.js'

export async function exportMarkdown(editor: NotilloEditor, title: string) {
	const md = await editor.blocksToMarkdownLossy(editor.document)
	const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
	downloadBlob(blob, `${title}.md`)
}

interface PageInfo {
	id: string
	title: string
}

const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const WIKI_LINK_TEST = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/**
 * Resolve [[wiki links]] in parsed BlockNote blocks to wikiLink inline content.
 * Matches page titles case-insensitively against the provided pages map.
 * Unresolved links become "broken" wikiLinks (empty pageId).
 */
// biome-ignore lint/suspicious/noExplicitAny: BlockNote block types are schema-dependent, using any for generic traversal
function resolveWikiLinks(blocks: any[], pages: Map<string, PageInfo>): any[] {
	// Build case-insensitive title -> pageId lookup
	const titleToId = new Map<string, string>()
	for (const [id, page] of pages) {
		titleToId.set(page.title.toLowerCase(), id)
	}

	return blocks.map((block) => processBlock(block, titleToId))
}

// biome-ignore lint/suspicious/noExplicitAny: BlockNote block types are schema-dependent
function processBlock(block: any, titleToId: Map<string, string>): any {
	const result = { ...block }

	// Process inline content array
	if (Array.isArray(result.content)) {
		result.content = processInlineContent(result.content, titleToId)
	}

	// Recurse into children
	if (Array.isArray(result.children)) {
		// biome-ignore lint/suspicious/noExplicitAny: BlockNote child blocks are schema-dependent
		result.children = result.children.map((child: any) => processBlock(child, titleToId))
	}

	return result
}

// biome-ignore lint/suspicious/noExplicitAny: BlockNote inline content types are schema-dependent
function processInlineContent(content: any[], titleToId: Map<string, string>): any[] {
	// biome-ignore lint/suspicious/noExplicitAny: accumulator for mixed inline content types
	const result: any[] = []

	for (const item of content) {
		if (
			item.type === 'text' &&
			typeof item.text === 'string' &&
			WIKI_LINK_TEST.test(item.text)
		) {
			// Create a fresh regex to avoid shared lastIndex state
			const re = new RegExp(WIKI_LINK_PATTERN.source, 'g')
			let lastIndex = 0

			for (let match = re.exec(item.text); match !== null; match = re.exec(item.text)) {
				// Add text before the match
				if (match.index > lastIndex) {
					result.push({ ...item, text: item.text.slice(lastIndex, match.index) })
				}

				// Resolve the wiki link — use alias (match[2]) as display title if present
				const pageName = match[1].trim()
				const displayName = match[2]?.trim() || pageName
				const pageId = titleToId.get(pageName.toLowerCase()) || ''
				result.push({
					type: 'wikiLink',
					props: { pageId, pageTitle: displayName }
				})

				lastIndex = match.index + match[0].length
			}

			// Add remaining text after last match
			if (lastIndex < item.text.length) {
				result.push({ ...item, text: item.text.slice(lastIndex) })
			}
		} else if (item.type === 'link' && Array.isArray(item.content)) {
			// Recurse into link content
			result.push({ ...item, content: processInlineContent(item.content, titleToId) })
		} else {
			result.push(item)
		}
	}

	return result
}

export async function importMarkdown(
	editor: NotilloEditor,
	markdown: string,
	pages?: Map<string, PageInfo>
) {
	const blocks = await editor.tryParseMarkdownToBlocks(markdown)
	const resolved = pages ? resolveWikiLinks(blocks, pages) : blocks
	editor.replaceBlocks(editor.document, resolved)
}

// vim: ts=4
