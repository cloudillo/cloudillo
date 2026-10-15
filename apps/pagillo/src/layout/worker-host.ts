// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main-thread side of the layout worker: starts it beside this bundle, sends the doc state and
 * then every Y.Doc update. No layout or model work happens here.
 */

import * as Y from 'yjs'

import type { Composition, MainToWorker, PdfExportOptions, WorkerToMain } from '../worker/protocol'

/** Worker → main messages of a PDF job. */
export type PdfEvent = Extract<WorkerToMain, { type: 'pdf.progress' | 'pdf.done' | 'pdf.error' }>

export interface LayoutHost {
	/** `update` messages posted so far (compare with `layout.seq`). */
	readonly sent: number
	setViewport(pages: [number, number]): void
	/** Show (or with `text: ''` clear) an IME composition in the layout. */
	compose(c: Composition): void
	/** Start a PDF job (cancels a running one); `on` gets its `pdf.*` messages until done or error. */
	exportPdf(options: PdfExportOptions, on: (e: PdfEvent) => void): void
	cancelPdf(): void
	dispose(): void
}

/** Live host per Y.Doc: the export dialog reaches the worker `useLayout` started. */
const hosts = new WeakMap<Y.Doc, LayoutHost>()
export const layoutHostOf = (yDoc: Y.Doc): LayoutHost | undefined => hosts.get(yDoc)

export function startLayoutWorker(yDoc: Y.Doc, onMessage: (msg: WorkerToMain) => void): LayoutHost {
	const worker = new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' })
	let sent = 0
	let viewport = ''
	let failed = false
	let pdf: ((e: PdfEvent) => void) | undefined
	/** Id of the current PDF job: replies of an earlier (cancelled) job are dropped. */
	let pdfId = 0
	const post = (msg: MainToWorker, transfer: Transferable[] = []) =>
		worker.postMessage(msg, transfer)
	const fail = (message: string) => {
		if (failed) return
		failed = true
		worker.terminate()
		onMessage({ type: 'error', message })
		pdf?.({ type: 'pdf.error', id: pdfId, message })
		pdf = undefined
	}

	worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
		const m = e.data
		if (m.type === 'pdf.progress' || m.type === 'pdf.done' || m.type === 'pdf.error') {
			if (m.id !== pdfId) return
			const on = pdf
			if (m.type !== 'pdf.progress') pdf = undefined
			on?.(m)
		} else if (m.type === 'error') fail(m.message)
		else if (!failed) onMessage(m)
	}
	worker.onerror = (e) => {
		e.preventDefault()
		fail(e.message || 'Layout worker failed to start')
	}
	worker.onmessageerror = () => fail('Layout worker message could not be decoded')

	// The update is ours to transfer; later ones are shared with the provider/persistence: copied.
	const update = Y.encodeStateAsUpdate(yDoc)
	post({ type: 'init', update, fontBase: new URL(import.meta.url).origin }, [update.buffer])
	const onUpdate = (u: Uint8Array) => {
		sent++
		post({ type: 'update', u })
	}
	yDoc.on('update', onUpdate)

	const host: LayoutHost = {
		get sent() {
			return sent
		},
		setViewport(pages) {
			const key = pages.join(':')
			if (key === viewport) return
			viewport = key
			post({ type: 'viewport', pages })
		},
		compose(c) {
			post({ type: 'compose', ...c })
		},
		exportPdf(options, on) {
			if (failed) {
				on({ type: 'pdf.error', id: pdfId, message: 'The layout engine stopped' })
				return
			}
			pdf = on
			post({ type: 'pdf.export', id: ++pdfId, options })
		},
		cancelPdf() {
			pdf = undefined
			post({ type: 'pdf.cancel' })
		},
		dispose() {
			yDoc.off('update', onUpdate)
			failed = true
			worker.terminate()
			pdf = undefined
			if (hosts.get(yDoc) === host) hosts.delete(yDoc)
		}
	}
	hosts.set(yDoc, host)
	return host
}

// vim: ts=4
