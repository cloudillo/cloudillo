// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main-thread side of the layout worker: starts it beside this bundle, sends the doc state and
 * then every Y.Doc update. No layout or model work happens here.
 */

import * as Y from 'yjs'

import type { Composition, MainToWorker, WorkerToMain } from '../worker/protocol'

export interface LayoutHost {
	/** `update` messages posted so far (compare with `layout.seq`). */
	readonly sent: number
	setViewport(pages: [number, number]): void
	/** Show (or with `text: ''` clear) an IME composition in the layout. */
	compose(c: Composition): void
	dispose(): void
}

export function startLayoutWorker(yDoc: Y.Doc, onMessage: (msg: WorkerToMain) => void): LayoutHost {
	const worker = new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' })
	let sent = 0
	let viewport = ''
	let failed = false
	const post = (msg: MainToWorker, transfer: Transferable[] = []) =>
		worker.postMessage(msg, transfer)
	const fail = (message: string) => {
		if (failed) return
		failed = true
		worker.terminate()
		onMessage({ type: 'error', message })
	}

	worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
		if (e.data.type === 'error') fail(e.data.message)
		else if (!failed) onMessage(e.data)
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

	return {
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
		dispose() {
			yDoc.off('update', onUpdate)
			failed = true
			worker.terminate()
		}
	}
}

// vim: ts=4
