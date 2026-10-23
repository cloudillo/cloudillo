// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Quill delta → DOCX.
 *
 * Kept free of Quill and `@cloudillo/core` imports (the blots call `Quill.import` at load) so
 * the mapping runs under jest's node environment. Image bytes come from the caller's
 * `loadImage`, which is the only browser-dependent part.
 *
 * Mapped: headings, bold/italic/underline, links, ordered/bullet lists (with indent), tables
 * (quill-table-better line attributes) and `cl-image` embeds. Fonts, sizes, colours, alignment
 * and `cl-document` embeds are dropped.
 */

import {
	AlignmentType,
	Document,
	ExternalHyperlink,
	HeadingLevel,
	ImageRun,
	LevelFormat,
	Packer,
	Paragraph,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType
} from 'docx'

import { isSafeLink } from './links.js'

type Attrs = Record<string, unknown>

export interface DeltaOp {
	insert?: string | Record<string, unknown>
	attributes?: Attrs
}

export interface Run {
	text: string
	bold?: boolean
	italic?: boolean
	underline?: boolean
	link?: string
}

export interface Line {
	runs: Run[]
	header?: number
	list?: 'ordered' | 'bullet'
	indent?: number
}

export interface TableCellBlock {
	id: string
	lines: Line[]
}

export interface TableRowBlock {
	id: string
	header: boolean
	cells: TableCellBlock[]
}

export type Block =
	| ({ type: 'line' } & Line)
	| { type: 'table'; rows: TableRowBlock[] }
	| { type: 'image'; fileId: string; alt?: string; width?: string }

export interface DocxImage {
	/** PNG bytes */
	data: ArrayBuffer | Uint8Array
	width: number
	height: number
}

export type ImageLoader = (img: { fileId: string; width?: string }) => Promise<DocxImage | null>

function toRun(text: string, a: Attrs): Run {
	const run: Run = { text }
	if (a.bold) run.bold = true
	if (a.italic) run.italic = true
	if (a.underline) run.underline = true
	if (typeof a.link === 'string') run.link = a.link
	return run
}

function toLine(runs: Run[], a: Attrs): Line {
	const line: Line = { runs }
	if (typeof a.header === 'number') line.header = a.header
	if (typeof a.list === 'string') line.list = a.list === 'ordered' ? 'ordered' : 'bullet'
	if (typeof a.indent === 'number') line.indent = a.indent
	return line
}

/** Group a delta into lines, tables and images. Block attributes sit on each line's `\n`. */
export function deltaToBlocks(ops: readonly DeltaOp[]): Block[] {
	const blocks: Block[] = []
	let runs: Run[] = []

	function endLine(a: Attrs) {
		const line = toLine(runs, a)
		runs = []
		if (a['table-col']) return // column width ops carry no content
		const cell = a['table-cell'] ?? a['table-th']
		const cellId = a['table-cell-block'] ?? a['table-th-block']
		if (cell === undefined || cellId === undefined) {
			blocks.push({ type: 'line', ...line })
			return
		}
		const rowId = String(typeof cell === 'object' && cell ? (cell as Attrs)['data-row'] : cell)
		// two tables with nothing between them merge into one
		let table = blocks.at(-1)
		if (table?.type !== 'table') {
			table = { type: 'table', rows: [] }
			blocks.push(table)
		}
		let row = table.rows.at(-1)
		if (row?.id !== rowId) {
			row = { id: rowId, header: false, cells: [] }
			table.rows.push(row)
		}
		if (a['table-th'] !== undefined) row.header = true
		let c = row.cells.at(-1)
		if (c?.id !== String(cellId)) {
			c = { id: String(cellId), lines: [] }
			row.cells.push(c)
		}
		c.lines.push(line)
	}

	for (const op of ops) {
		const a = op.attributes ?? {}
		if (typeof op.insert !== 'string') {
			const img = op.insert?.['cl-image'] as
				| { fileId?: string; alt?: string; width?: string }
				| undefined
			if (img?.fileId) {
				// text around an inline image is split into separate paragraphs (the
				// preceding fragment loses the line's block attributes); inline ImageRuns would fix it
				if (runs.length) endLine({})
				blocks.push({ type: 'image', fileId: img.fileId, alt: img.alt, width: img.width })
			}
			continue
		}
		const parts = op.insert.split('\n')
		parts.forEach((text, i) => {
			if (i > 0) endLine(a)
			if (text) runs.push(toRun(text, a))
		})
	}
	if (runs.length) endLine({})
	return blocks
}

const HEADINGS = [
	HeadingLevel.HEADING_1,
	HeadingLevel.HEADING_2,
	HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4,
	HeadingLevel.HEADING_5,
	HeadingLevel.HEADING_6
]

function runToDocx(r: Run) {
	const link = r.link && isSafeLink(r.link) ? r.link : undefined
	const text = new TextRun({
		text: r.text,
		bold: r.bold,
		italics: r.italic,
		underline: r.underline ? {} : undefined,
		style: link ? 'Hyperlink' : undefined
	})
	return link ? new ExternalHyperlink({ link, children: [text] }) : text
}

function lineToDocx(line: Line, instance: number) {
	const level = line.indent ?? 0
	return new Paragraph({
		children: line.runs.map(runToDocx),
		heading: line.header ? HEADINGS[line.header - 1] : undefined,
		bullet: line.list === 'bullet' ? { level } : undefined,
		numbering: line.list === 'ordered' ? { reference: 'ordered', level, instance } : undefined
	})
}

export async function deltaToDocx(
	ops: readonly DeltaOp[],
	loadImage?: ImageLoader
): Promise<Document> {
	const children: (Paragraph | Table)[] = []
	// Each ordered list restarts at 1: a new numbering instance per run of ordered lines.
	// A nested list line (indent > 0) inside the run doesn't break it.
	let instances = 0
	const numberer = () => {
		let current = 0
		let inOrdered = false
		return (line?: Line) => {
			if (line?.list === 'ordered' && !inOrdered) current = ++instances
			inOrdered =
				line?.list === 'ordered' || (inOrdered && !!line?.list && (line.indent ?? 0) > 0)
			return current
		}
	}
	const number = numberer()
	for (const b of deltaToBlocks(ops)) {
		if (b.type === 'line') {
			children.push(lineToDocx(b, number(b)))
			continue
		}
		number()
		if (b.type === 'table') {
			children.push(
				new Table({
					width: { size: 100, type: WidthType.PERCENTAGE },
					rows: b.rows.map(
						(row) =>
							new TableRow({
								tableHeader: row.header,
								children: row.cells.map((c) => {
									const n = numberer()
									return new TableCell({
										children: c.lines.map((l) => lineToDocx(l, n(l)))
									})
								})
							})
					)
				})
			)
			continue
		}
		const img = await loadImage?.(b)
		if (img) {
			children.push(
				new Paragraph({
					children: [
						new ImageRun({
							type: 'png',
							data: img.data,
							transformation: { width: img.width, height: img.height },
							altText: b.alt
								? { name: b.alt, description: b.alt, title: b.alt }
								: undefined
						})
					]
				})
			)
		}
	}

	return new Document({
		numbering: {
			config: [
				{
					reference: 'ordered',
					levels: Array.from({ length: 9 }, (_, level) => ({
						level,
						format: LevelFormat.DECIMAL,
						text: `%${level + 1}.`,
						alignment: AlignmentType.START,
						style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
					}))
				}
			]
		},
		sections: [{ children }]
	})
}

export async function exportDocx(ops: readonly DeltaOp[], loadImage?: ImageLoader): Promise<Blob> {
	return Packer.toBlob(await deltaToDocx(ops, loadImage))
}

// vim: ts=4
