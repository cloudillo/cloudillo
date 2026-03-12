import type { NotilloEditor } from '../editor/schema.js'
import type { WikiLinkContent, TagContent } from '../rtdb/types.js'
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
				wikiLink: (ic: WikiLinkContent) => ic.props.pageTitle as string,
				tag: (ic: TagContent) => `#${ic.props.tag}`
			}
			// biome-ignore lint/suspicious/noExplicitAny: BlockNote exporter schema mapping type boundary
		} as any,
		resolveFileUrl ? { resolveFileUrl } : undefined
	)

	const blob = await exporter.toODTDocument(editor.document)
	downloadBlob(blob, `${title}.odt`)
}

// vim: ts=4
