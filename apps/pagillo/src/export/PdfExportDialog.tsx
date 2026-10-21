// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Export PDF dialog: preflight rows (never blocking, each jumps to the spot), pages,
 * quality, Advanced › PDF/A-2, filename. Embeds of the exported pages are rendered here first
 * (main owns the bus; `renderEmbeds`), then the job runs in the layout worker; progress replaces
 * the form, success downloads and closes (stays open with a warning if images were left blank
 * or embeds could not be rendered — those get a preflight row with Retry), an error stays here
 * with Retry.
 */

import { downloadBlob, getAppBus, sanitizeFilename } from '@cloudillo/core'
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
import { frameOf, framesOf } from '../crdt/entities'
import type { YPagilloDocument } from '../crdt/stored-types'
import { readMeta } from '../crdt/type-converters'
import type { LayoutState } from '../layout/useLayout'
import { layoutHostOf, type PdfEvent } from '../layout/worker-host'
import { flattenPages } from '../view/PageList'
import type { EmptyImage } from '../view/PageSvg'
import type { PdfExportOptions } from '../worker/protocol'
import { isEmptyRange, type PreflightRow, parsePageRange, preflightRows } from './preflight'
import { type EmbedFailure, embedJobs, prepareEmbeds } from './prepare-embeds'

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
	const [progress, setProgress] = React.useState<{
		done: number
		total: number
		/** Rendering embeds, before the worker writes pages. */
		embeds?: true
	}>()
	const [error, setError] = React.useState<string>()
	const [missing, setMissing] = React.useState(0)
	const [failed, setFailed] = React.useState<EmbedFailure[]>([])
	const total = layout.pageCount
	const flat = flattenPages(layout.sections)
	/** Successful renders by `jobKey`: Retry renders only what failed. */
	const renders = React.useRef(new Map<string, { svg: string }>())
	const prep = React.useRef<AbortController>(undefined)

	// Closing mid-job cancels it.
	const running = React.useRef(false)
	React.useEffect(
		() => () => {
			prep.current?.abort()
			if (running.current) layoutHostOf(yDoc)?.cancelPdf()
		},
		[yDoc]
	)

	const embedRow: PreflightRow | undefined = failed.length
		? {
				key: 'embeds',
				label: t('{{count}} embeds could not be rendered: {{list}}', {
					count: failed.length,
					list: failed.map((f) => `${f.title} (${f.error})`).join(', ')
				}),
				page: failed[0].page,
				frame: frameOf(doc, failed[0].frameId) ? failed[0].frameId : undefined
			}
		: undefined
	const allRows = embedRow ? [...rows, embedRow] : rows

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

	async function start(evt?: React.FormEvent<HTMLFormElement>) {
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
		const keys = pages ?? flat.map((p) => p.key)
		// An embed on a page main has not laid out would silently print "Content unavailable".
		if (layout.pending || keys.some((k) => !layout.pages.has(k))) {
			setError(t('The layout is still updating. Try again in a moment.'))
			return
		}
		setError(undefined)
		setMissing(0)
		running.current = true
		prep.current?.abort()
		const ac = new AbortController()
		prep.current = ac
		let prepared: Awaited<ReturnType<typeof prepareEmbeds>>
		try {
			prepared = await prepareEmbeds(embedJobs(layout, doc, keys), {
				sourceFileId: getAppBus().fileId,
				renders: renders.current,
				signal: ac.signal,
				t,
				onProgress: (done, n) => setProgress({ done, total: n, embeds: true })
			})
		} catch (err) {
			if (ac.signal.aborted) return
			running.current = false
			setProgress(undefined)
			setError(err instanceof Error ? err.message : String(err))
			return
		}
		if (!prepared || ac.signal.aborted) {
			running.current = false
			return
		}
		setFailed(prepared.failed)
		setProgress({ done: 0, total: pages?.length ?? total })
		const { embeds } = prepared
		const bad = prepared.failed.length
		host.exportPdf({ pages, pdfa, downsample, title, files, embeds }, (e: PdfEvent) => {
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
			if (e.missing === 0 && bad === 0) onClose()
		})
	}

	const cancel = () => {
		prep.current?.abort()
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
								disabled={(mode === 'range' && !!rangeErr) || layout.pending}
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
						{progress.embeds
							? t('Preparing {{n}} of {{m}} embeds…', {
									n: Math.min(progress.done + 1, progress.total),
									m: progress.total
								})
							: progress.done < progress.total
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
					{allRows.length > 0 && (
						<List aria-label={t('Before you export')}>
							{allRows.map((r) => (
								<ListItem
									key={r.key}
									size="sm"
									title={r.label}
									trailing={
										<>
											{r === embedRow && (
												<Button
													size="sm"
													variant="link"
													onClick={() => void start()}
												>
													{t('Retry')}
												</Button>
											)}
											{(r.page || r.frame) && (
												<Button
													size="sm"
													variant="link"
													onClick={() => onJump(r)}
												>
													{t('Jump')}
												</Button>
											)}
										</>
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
