import type { NotilloEditor } from '../editor/schema.js'
import { downloadBlob } from './download.js'

export async function exportOdt(
	editor: NotilloEditor,
	title: string,
	resolveFileUrl?: (url: string) => Promise<string | Blob>
) {
	const { ODTExporter, odtDefaultSchemaMappings } = await import('@blocknote/xl-odt-exporter')

	const exporter = new ODTExporter(
		editor.schema,
		{
			...odtDefaultSchemaMappings,
			inlineContentMapping: {
				...odtDefaultSchemaMappings.inlineContentMapping,
				wikiLink: (ic: any) => ic.props.pageTitle as string,
				tag: (ic: any) => `#${ic.props.tag}`
			}
		} as any,
		resolveFileUrl ? { resolveFileUrl } : undefined
	)

	const blob = await exporter.toODTDocument(editor.document)
	downloadBlob(blob, `${title}.odt`)
}

// vim: ts=4
