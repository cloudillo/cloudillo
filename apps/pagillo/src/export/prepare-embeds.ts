// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Render SVGs of the exported pages' embeds for the PDF (main owns the bus; `renderEmbeds`). */

import { getAppBus, renderEmbeds } from '@cloudillo/core'
import type { PdfEmbed } from '@cloudillo/typeset/pdf'

import type { YPagilloDocument } from '../crdt/stored-types'
import { type EmbedRecord, embedTarget, fxToCssPx } from '../embeds/record'
import { embedRecordOf } from '../embeds/useEmbedRenders'
import type { LayoutState } from '../layout/useLayout'

/** A DL embed item of an exported page. */
export interface EmbedJob {
	frameId: string
	page: string
	/** Box, Fx. */
	w: number
	h: number
	rec: EmbedRecord
}

export interface EmbedFailure {
	frameId: string
	page: string
	title: string
	error: string
}

export const jobKey = (j: EmbedJob) => `${j.frameId}|${j.rec.address}|${j.w}x${j.h}`

/** Embeds on pages `keys`, from main's display lists (every key must be laid out). */
export function embedJobs(layout: LayoutState, doc: YPagilloDocument, keys: string[]): EmbedJob[] {
	const out: EmbedJob[] = []
	const seen = new Set<string>()
	for (const key of keys) {
		for (const it of layout.pages.get(key)?.items ?? []) {
			if (it.k !== 'embed' || seen.has(it.frameId)) continue
			seen.add(it.frameId)
			const rec = embedRecordOf(doc, it.frameId)
			if (rec) out.push({ frameId: it.frameId, page: key, w: it.box.w, h: it.box.h, rec })
		}
	}
	return out
}

export interface PrepareEmbedsOpts {
	sourceFileId?: string
	/** Successful renders by `jobKey`, kept across calls: Retry renders only what failed. */
	renders: Map<string, { svg: string }>
	signal: AbortSignal
	t: (key: string) => string
	onProgress?: (done: number, total: number) => void
}

/** Render SVGs for the jobs not in `renders`; undefined when cancelled. */
export async function prepareEmbeds(
	jobs: EmbedJob[],
	{ sourceFileId, renders, signal, t, onProgress }: PrepareEmbedsOpts
): Promise<{ embeds: Record<string, PdfEmbed>; failed: EmbedFailure[] } | undefined> {
	const failed: EmbedFailure[] = []
	const fail = (j: EmbedJob, error: string) =>
		failed.push({ frameId: j.frameId, page: j.page, title: j.rec.lastTitle, error })
	const ready: EmbedJob[] = []
	for (const j of jobs) {
		if (renders.has(jobKey(j))) continue
		if (!sourceFileId) fail(j, t('no host document'))
		else if (!embedTarget(j.rec)) fail(j, t('not a document link'))
		else ready.push(j)
	}
	if (ready.length && sourceFileId) {
		onProgress?.(0, ready.length)
		const out = await renderEmbeds(
			ready.map((j) => {
				const tg = embedTarget(j.rec)!
				return {
					bus: getAppBus(),
					targetFileId: tg.fileId,
					targetContentType: tg.contentType,
					sourceFileId,
					nav: tg.nav,
					page: { w: fxToCssPx(j.w), h: fxToCssPx(j.h) }
				}
			}),
			{
				signal,
				onProgress: (done, n) => {
					if (!signal.aborted) onProgress?.(done, n)
				}
			}
		)
		if (signal.aborted) return
		out.forEach((r, i) => {
			const j = ready[i]
			if (r.ok && r.pages[0]) renders.set(jobKey(j), { svg: r.pages[0] })
			else fail(j, r.ok ? t('empty render') : r.error)
		})
	}
	if (signal.aborted) return
	const embeds: Record<string, PdfEmbed> = {}
	for (const j of jobs) {
		embeds[j.frameId] = {
			...renders.get(jobKey(j)),
			title: typeof j.rec.lastTitle === 'string' ? j.rec.lastTitle : undefined,
			address: embedTarget(j.rec) ? j.rec.address : undefined
		}
	}
	return { embeds, failed }
}

// vim: ts=4
