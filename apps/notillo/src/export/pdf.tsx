// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	embedLabel,
	type EmbedRenderContext,
	type RenderEmbedOutcome,
	renderEmbedMap
} from '@cloudillo/core'
import * as React from 'react'

import type { NotilloEditor } from '../editor/schema.js'
import type { TagContent, WikiLinkContent } from '../rtdb/types.js'
import { downloadBlob } from './download.js'
import { rasterizeImages, svgToReactPdf } from './svg-to-react-pdf.js'

/**
 * Export options. Without `bus` + `sourceFileId` (no file id) every embed prints as a
 * placeholder; `signal` cancels either way.
 */
export type PdfEmbedOptions = Partial<EmbedRenderContext> & {
	/** Owner of this document, for the placeholders' `cl:` links */
	ownerTag?: string
}

/** A4 (595 pt) minus the exporter's 35 pt horizontal page padding */
const CONTENT_WIDTH = 525
/** Below the A4 content height (842 − 35 − 65), so an embed never needs a page break */
const MAX_EMBED_HEIGHT = 700

const ALIGN: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
	left: 'flex-start',
	center: 'center',
	right: 'flex-end'
}

// biome-ignore lint/suspicious/noExplicitAny: BlockNote block types are schema-generic
type AnyBlock = any

/** Every `documentEmbed` block with a document, depth-first (columns nest via `children`) */
function collectEmbeds(blocks: AnyBlock[], out: AnyBlock[] = []): AnyBlock[] {
	for (const b of blocks) {
		if (b.type === 'documentEmbed' && b.props.fileId) out.push(b)
		if (b.children?.length) collectEmbeds(b.children, out)
	}
	return out
}

export async function exportPdf(
	editor: NotilloEditor,
	title: string,
	resolveFileUrl?: (url: string) => Promise<string | Blob>,
	embeds?: PdfEmbedOptions
) {
	const [{ PDFExporter, pdfDefaultSchemaMappings }, R] = await Promise.all([
		import('@blocknote/xl-pdf-exporter/react-pdf'),
		import('@react-pdf/renderer')
	])
	const { pdf, Text, View, Image, Link } = R

	const PIXELS_PER_POINT = 0.75

	// Render every embed headlessly up front (no caching: each export asks again).
	// The shell refuses sources that cannot render; those come back `ok: false`.
	const { bus, sourceFileId } = embeds ?? {}
	const rendered =
		bus && sourceFileId
			? await renderEmbedMap(
					collectEmbeds(editor.document).map((b) => ({ id: b.id, ...b.props })),
					{ ...embeds, bus, sourceFileId }
				)
			: new Map<string, RenderEmbedOutcome>()
	if (embeds?.signal?.aborted) return

	/** Title + `cl:` link card, for non-render sources and every failure */
	const placeholder = (block: AnyBlock) => {
		const p = block.props
		const { ref = '' } = embedLabel(p, embeds?.ownerTag)
		return (
			<View
				wrap={false}
				key={'embed' + block.id}
				style={{
					borderWidth: 1,
					borderStyle: 'dashed',
					borderColor: '#cccccc',
					backgroundColor: '#f5f5f5',
					padding: 8,
					marginVertical: 4
				}}
			>
				<Text style={{ fontSize: 14 * PIXELS_PER_POINT }}>{p.name || p.fileId}</Text>
				{ref && (
					<Link src={ref} style={{ fontSize: 10 * PIXELS_PER_POINT, color: '#666666' }}>
						{ref}
					</Link>
				)}
			</View>
		)
	}

	const documentEmbed = (useRenders: boolean) => async (block: AnyBlock) => {
		if (!block.props.fileId) return <View key={'embed' + block.id} />
		const r = useRenders ? rendered.get(block.id) : undefined
		if (r?.ok && r.pages[0] && r.natural.w > 0 && r.natural.h > 0) {
			// The block's width % of the content width, aspect kept, capped to one page
			let w = (CONTENT_WIDTH * (block.props.width || 100)) / 100
			let h = (w * r.natural.h) / r.natural.w
			if (h > MAX_EMBED_HEIGHT) {
				w *= MAX_EMBED_HEIGHT / h
				h = MAX_EMBED_HEIGHT
			}
			const svg = svgToReactPdf(await rasterizeImages(r.pages[0]), R, { w, h })
			if (svg) {
				return (
					<View
						wrap={false}
						key={'embed' + block.id}
						style={{
							alignItems: ALIGN[block.props.align] ?? 'center',
							marginVertical: 4
						}}
					>
						{svg}
					</View>
				)
			}
		}
		return placeholder(block)
	}

	const build = (useRenders: boolean) =>
		new PDFExporter(
			editor.schema,
			{
				...pdfDefaultSchemaMappings,
				blockMapping: {
					...pdfDefaultSchemaMappings.blockMapping,
					// biome-ignore lint/suspicious/noExplicitAny: BlockNote PDF exporter block/transform types are not exported
					image: async (block: any, t: any) => {
						return (
							<View wrap={false} key={'image' + block.id}>
								<Image
									src={await t.resolveFile(block.props.url)}
									style={{
										width: block.props.previewWidth
											? block.props.previewWidth * PIXELS_PER_POINT
											: undefined,
										maxWidth: '100%'
									}}
								/>
								{block.props.caption && (
									<Text style={{ fontSize: 10 * PIXELS_PER_POINT }}>
										{block.props.caption}
									</Text>
								)}
							</View>
						)
					},
					documentEmbed: documentEmbed(useRenders)
				},
				inlineContentMapping: {
					...pdfDefaultSchemaMappings.inlineContentMapping,
					wikiLink: (ic: WikiLinkContent) => (
						<Text key={ic.props.pageId}>{ic.props.pageTitle}</Text>
					),
					tag: (ic: TagContent) => <Text key={ic.props.tag}>#{ic.props.tag}</Text>
				}
				// biome-ignore lint/suspicious/noExplicitAny: BlockNote exporter schema mapping type boundary
			} as any,
			resolveFileUrl ? { resolveFileUrl } : undefined
		)

	let blob: Blob
	try {
		blob = await pdf(await build(true).toReactPDFDocument(editor.document)).toBlob()
	} catch (err) {
		if (!rendered.size) throw err
		// A render the converter mistranslated must not fail the export: retry with placeholders
		console.warn('[notillo] PDF with embed renders failed, retrying with placeholders', err)
		blob = await pdf(await build(false).toReactPDFDocument(editor.document)).toBlob()
	}
	if (embeds?.signal?.aborted) return
	downloadBlob(blob, `${title}.pdf`)
}

// vim: ts=4
