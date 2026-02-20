import type { NotilloEditor } from '../editor/schema.js'
import { downloadBlob } from './download.js'

export async function exportDocx(
	editor: NotilloEditor,
	title: string,
	resolveFileUrl?: (url: string) => Promise<string | Blob>
) {
	const [{ DOCXExporter, docxDefaultSchemaMappings }, { TextRun }] = await Promise.all([
		import('@blocknote/xl-docx-exporter'),
		import('docx')
	])

	const exporter = new DOCXExporter(
		editor.schema,
		{
			...docxDefaultSchemaMappings,
			inlineContentMapping: {
				...docxDefaultSchemaMappings.inlineContentMapping,
				wikiLink: (ic: any) => new TextRun(ic.props.pageTitle),
				tag: (ic: any) => new TextRun(`#${ic.props.tag}`)
			}
		} as any,
		resolveFileUrl ? { resolveFileUrl } : undefined
	)

	const blob = await exporter.toBlob(editor.document)
	downloadBlob(blob, `${title}.docx`)
}

// vim: ts=4
