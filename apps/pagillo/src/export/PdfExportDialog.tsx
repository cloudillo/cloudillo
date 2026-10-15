// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Export PDF dialog: preflight rows (never blocking, each jumps to the spot), pages,
 * quality, Advanced › PDF/A-2, filename. The job runs in the layout worker; progress replaces
 * the form, success downloads and closes (stays open with a warning if images were left blank),
 * an error stays here with Retry.
 */

import { downloadBlob, sanitizeFilename } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Checkbox,
	Dialog,
	Disclosure,
	Field,
	Input,
	List,
	ListItem,
	Progress,
	RadioGroup
} from '@cloudillo/react'
import type { PdfDownsample } from '@cloudillo/typeset/pdf'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { setMeta } from '../crdt/document'
import { framesOf } from '../crdt/entities'
import type { YPagilloDocument } from '../crdt/stored-types'
import { readMeta } from '../crdt/type-converters'
import type { LayoutState } from '../layout/useLayout'
import { layoutHostOf, type PdfEvent } from '../layout/worker-host'
import { flattenPages } from '../view/PageList'
import type { EmptyImage } from '../view/PageSvg'
import type { PdfExportOptions } from '../worker/protocol'
import { isEmptyRange, type PreflightRow, parsePageRange, preflightRows } from './preflight'

export interface PdfExportDialogProps {
	yDoc: Y.Doc
	doc: YPagilloDocument
	layout: LayoutState
	/** Global index of the current page. */
	current: number
	emptyImages: Map<string, EmptyImage[]>
	/** Title used when `m.title` is empty (PDF title and default filename). */
	fallbackTitle: string
	files: PdfExportOptions['files']
	/** Writers remember the options and `exportedAt` in `m`; readers export only. */
	writer: boolean
	onJump: (row: PreflightRow) => void
	onClose: () => void
}

type PageMode = 'all' | 'current' | 'range'

function usePreflight({ layout, doc, emptyImages }: PdfExportDialogProps): PreflightRow[] {
	const { t } = useTranslation()
	return React.useMemo(
		() => preflightRows({ layout, frames: framesOf(doc), emptyImages }, t),
		[layout, doc, emptyImages, t]
	)
}

export function PdfExportDialog(props: PdfExportDialogProps) {
	const { yDoc, doc, layout, current, files, writer, onJump, onClose } = props
	const { t } = useTranslation()
	const rows = usePreflight(props)
	const [meta] = React.useState(() => readMeta(doc.m))
	const title = meta.title || props.fallbackTitle
	const saved = meta.pdf ?? {}
	const [mode, setMode] = React.useState<PageMode>('all')
	const [range, setRange] = React.useState('')
	const [rangeErr, setRangeErr] = React.useState<string>()
	const [downsample, setDownsample] = React.useState<PdfDownsample>(() =>
		saved.downsample === 'none' || saved.downsample === '150' ? saved.downsample : '300'
	)
	const [pdfa, setPdfa] = React.useState(saved.pdfa === true)
	const [fileName, setFileName] = React.useState(`${title}.pdf`)
	const [progress, setProgress] = React.useState<{ done: number; total: number }>()
	const [error, setError] = React.useState<string>()
	const [missing, setMissing] = React.useState(0)
	const total = layout.pageCount
	const flat = flattenPages(layout.sections)

	// Closing mid-job cancels it.
	const running = React.useRef(false)
	React.useEffect(
		() => () => {
			if (running.current) layoutHostOf(yDoc)?.cancelPdf()
		},
		[yDoc]
	)

	const checkRange = () => {
		const r = parsePageRange(range, total)
		setRangeErr(
			isEmptyRange(r)
				? t('Enter the pages to export, e.g. 1–3, 5')
				: typeof r === 'string'
					? t('Not a page range of 1–{{n}}: "{{part}}"', { n: total, part: r })
					: undefined
		)
		return r
	}

	function start(evt?: React.FormEvent<HTMLFormElement>) {
		evt?.preventDefault()
		let pages: string[] | undefined
		if (mode === 'current') pages = [flat[current].key]
		else if (mode === 'range') {
			const r = checkRange()
			if (typeof r === 'string') return
			pages = r.map((i) => flat[i].key)
		}
		const host = layoutHostOf(yDoc)
		if (!host) {
			setError(t('The layout engine stopped'))
			return
		}
		setError(undefined)
		setMissing(0)
		setProgress({ done: 0, total: pages?.length ?? total })
		running.current = true
		host.exportPdf({ pages, pdfa, downsample, title, files }, (e: PdfEvent) => {
			if (e.type === 'pdf.progress') {
				setProgress({ done: e.done, total: e.total })
				return
			}
			running.current = false
			setProgress(undefined)
			if (e.type === 'pdf.error') {
				setError(e.message)
				return
			}
			const name = sanitizeFilename(fileName.trim() || 'untitled.pdf')
			downloadBlob(e.blob, /\.pdf$/i.test(name) ? name : `${name}.pdf`)
			if (writer)
				setMeta(yDoc, doc, {
					pdf: { downsample, pdfa },
					exportedAt: new Date().toISOString()
				})
			if (e.missing > 0) setMissing(e.missing)
			else onClose()
		})
	}

	const cancel = () => {
		running.current = false
		layoutHostOf(yDoc)?.cancelPdf()
		setProgress(undefined)
	}

	const busy = !!progress

	return (
		<Dialog
			open
			size="sm"
			title={t('Export PDF')}
			dismissable={!busy}
			onClose={onClose}
			onSubmit={start}
			footer={
				<ActionBar>
					{busy ? (
						<Button onClick={cancel}>{t('Cancel')}</Button>
					) : (
						<>
							<Button onClick={onClose}>{t('Cancel')}</Button>
							<Button
								type="submit"
								color="primary"
								disabled={mode === 'range' && !!rangeErr}
							>
								{error ? t('Retry') : t('Export')}
							</Button>
						</>
					)}
				</ActionBar>
			}
		>
			{busy ? (
				<div className="c-vbox g-2" aria-live="polite">
					<p>
						{progress.done < progress.total
							? t('Writing page {{n}} of {{m}}', {
									n: progress.done + 1,
									m: progress.total
								})
							: t('Finishing…')}
					</p>
					<Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
				</div>
			) : (
				<div className="c-vbox g-3">
					{error && (
						<Alert color="error" title={t('PDF export failed')}>
							{error}
						</Alert>
					)}
					{missing > 0 && (
						<Alert color="warning">
							{t('{{count}} images could not be included and were left blank.', {
								count: missing
							})}
						</Alert>
					)}
					{rows.length > 0 && (
						<List aria-label={t('Before you export')}>
							{rows.map((r) => (
								<ListItem
									key={r.key}
									size="sm"
									title={r.label}
									trailing={
										(r.page || r.frame) && (
											<Button
												size="sm"
												variant="link"
												onClick={() => onJump(r)}
											>
												{t('Jump')}
											</Button>
										)
									}
								/>
							))}
						</List>
					)}
					<Field label={t('Pages')}>
						<RadioGroup<PageMode>
							orientation="horizontal"
							value={mode}
							onChange={setMode}
							options={[
								{ value: 'all', label: t('All') },
								{
									value: 'current',
									label: t('Current page ({{n}})', { n: current + 1 }),
									disabled: !flat[current]
								},
								{ value: 'range', label: t('Range') }
							]}
						/>
					</Field>
					{mode === 'range' && (
						<Field
							label={t('Page range')}
							hint={t('For example 3–7, 10')}
							error={rangeErr}
						>
							<Input
								value={range}
								placeholder="3–7, 10"
								onChange={(e) => {
									setRange(e.target.value)
									setRangeErr(undefined)
								}}
								onBlur={checkRange}
							/>
						</Field>
					)}
					<Field label={t('Quality')}>
						<RadioGroup<PdfDownsample>
							value={downsample}
							onChange={setDownsample}
							options={[
								{ value: '300', label: t('Print (300 dpi)') },
								{ value: '150', label: t('Screen / email (150 dpi)') },
								{ value: 'none', label: t('Original images') }
							]}
						/>
					</Field>
					<Field label={t('File name')}>
						<Input value={fileName} onChange={(e) => setFileName(e.target.value)} />
					</Field>
					<Disclosure summary={t('Advanced')}>
						<Checkbox
							label={t('Archive format (PDF/A-2)')}
							checked={pdfa}
							onChange={(e) => setPdfa(e.target.checked)}
						/>
						<p className="small text-muted">
							{t(
								'For long-term archiving. Bookmarks and accessibility tags are always included.'
							)}
						</p>
					</Disclosure>
				</div>
			)}
		</Dialog>
	)
}

// vim: ts=4
