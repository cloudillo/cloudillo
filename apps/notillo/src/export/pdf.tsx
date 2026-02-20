import * as React from 'react'
import type { NotilloEditor } from '../editor/schema.js'
import { downloadBlob } from './download.js'

export async function exportPdf(
	editor: NotilloEditor,
	title: string,
	resolveFileUrl?: (url: string) => Promise<string | Blob>
) {
	const [{ PDFExporter, pdfDefaultSchemaMappings }, { pdf, Text, View, Image }] =
		await Promise.all([import('@blocknote/xl-pdf-exporter'), import('@react-pdf/renderer')])

	const PIXELS_PER_POINT = 0.75

	const exporter = new PDFExporter(
		editor.schema,
		{
			...pdfDefaultSchemaMappings,
			blockMapping: {
				...pdfDefaultSchemaMappings.blockMapping,
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
				}
			},
			inlineContentMapping: {
				...pdfDefaultSchemaMappings.inlineContentMapping,
				wikiLink: (ic: any) => <Text key={ic.props.pageId}>{ic.props.pageTitle}</Text>,
				tag: (ic: any) => <Text key={ic.props.tag}>#{ic.props.tag}</Text>
			}
		} as any,
		resolveFileUrl ? { resolveFileUrl } : undefined
	)

	const doc = await exporter.toReactPDFDocument(editor.document)
	const blob = await pdf(doc).toBlob()
	downloadBlob(blob, `${title}.pdf`)
}

// vim: ts=4
