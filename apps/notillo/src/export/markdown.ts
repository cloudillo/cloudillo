// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { isVideoUrl } from '@blocknote/core'
import { escapeHtml, parseSiteFileRef, safeHref, stripFrontMatter } from '@cloudillo/core'
import { Marked } from 'marked'

import type { NotilloEditor } from '../editor/schema.js'
import { attr } from '../publish/render/escape.js'
import { downloadBlob } from './download.js'

/**
 * BlockNote's own Markdown parser turns every newline into a line break, so a hard-wrapped
 * paragraph comes in one row at a time. `marked` follows CommonMark: a soft break stays a
 * newline in the HTML, which `tryParseHTMLToBlocks` collapses to a space.
 */
const markdownParser = new Marked({
	async: false,
	renderer: {
		// BlockNote's parser made a video block of `![name](x.mp4)`, and our export writes that.
		image({ href, title, text }) {
			if (!isVideoUrl(href)) return false
			const name = text || title || undefined
			return `<video${attr('src', href)}${attr('data-name', name)}${attr('data-url', href)} controls></video>`
		},
		// marked's own output ends in a newline, which would stay in the code block.
		code({ text, lang }) {
			const language = lang?.match(/\S+/)?.[0]
			const cls = language ? `language-${language}` : undefined
			return `<pre><code${attr('class', cls)}>${escapeHtml(text)}</code></pre>`
		},
		// marked's own output ends in a space, which a loose item keeps at the start of its text.
		checkbox({ checked }) {
			return `<input type="checkbox" disabled${checked ? ' checked' : ''}>`
		}
	}
})

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

const MEDIA_BLOCKS = new Set(['image', 'video', 'audio', 'file'])

/**
 * As the publisher does (`renderImage`), refuse a media block by its address. It leaves a
 * paragraph behind, so the import does not lose it silently; the label never shows the URL.
 * A `documentEmbed` is always refused: Markdown has no way to make one, and only `pickDocument`
 * applies its access checks.
 */
function replaceUnsafeMedia(
	// biome-ignore lint/suspicious/noExplicitAny: BlockNote block types are schema-dependent
	blocks: any[],
	label: (name: string) => string,
	counter: { refused: number }
	// biome-ignore lint/suspicious/noExplicitAny: BlockNote block types are schema-dependent
): any[] {
	return blocks.map((block) => {
		const { type, props } = block
		const children = block.children && replaceUnsafeMedia(block.children, label, counter)
		const safe =
			type !== 'documentEmbed' &&
			(!MEDIA_BLOCKS.has(type) ||
				!props?.url ||
				parseSiteFileRef(props.url) ||
				safeHref(props.url))
		if (safe) return children ? { ...block, children } : block
		counter.refused++
		return { type: 'paragraph', content: label(props.caption || props.name || ''), children }
	})
}

/** `mediaLabel` gets the name of a refused media block, or `''`, and returns its stand-in text. */
export async function importMarkdown(
	editor: NotilloEditor,
	markdown: string,
	pages: Map<string, PageInfo> | undefined,
	mediaLabel: (name: string) => string
): Promise<{ refusedMedia: number }> {
	const counter = { refused: 0 }
	const html = markdownParser.parse(stripFrontMatter(markdown)) as string
	const blocks = replaceUnsafeMedia(editor.tryParseHTMLToBlocks(html), mediaLabel, counter)
	const resolved = pages ? resolveWikiLinks(blocks, pages) : blocks
	editor.replaceBlocks(editor.document, resolved)
	return { refusedMedia: counter.refused }
}

// vim: ts=4
