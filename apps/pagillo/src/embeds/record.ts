// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The embed record stored in an `emb` frame's `data` and in an inline `{ emb }` run, and
 * building one from a picked or pasted document. Render SVGs never go in here.
 */

import {
	type DocLinkResult,
	docRef,
	type EmbedSizing,
	getAppBus,
	parseDocRef,
	renderEmbed
} from '@cloudillo/core'
import { FX } from '@cloudillo/typeset'

export interface EmbedRecord {
	/** `cl:<appId>/<owner>:<fileId>[?nav=…]` (`docRef`); no nav = the whole document. */
	address: string
	linkType: 'view'
	/** Page frames `box` (the frame is the box), inline `fit-width`. */
	sizing: EmbedSizing
	/** CSS px at 96 dpi. */
	lastNatural: { w: number; h: number }
	lastTitle: string
	editInPlace: boolean
	alt: string
}

/** Shown instead of inserting a reflow source (English key, translated at use). */
export const REFLOW_NOTICE =
	'Quillo and Notillo documents can be linked once linked content is available.'
const REFLOW_APPS = new Set(['quillo', 'notillo'])
/** Quillo / Notillo: refused until linked content exists ({@link REFLOW_NOTICE}). */
export const isReflowApp = (appId: string) => REFLOW_APPS.has(appId)
export const DEFAULT_NATURAL = { w: 400, h: 300 }

/**
 * Display name of a source app id (`calcillo` → `Calcillo`). App ids are product names, never
 * translated; one that is not plain lowercase letters is returned as is.
 */
export const appLabel = (appId: string) =>
	/^[a-z]+$/.test(appId) ? appId.charAt(0).toUpperCase() + appId.slice(1) : appId

/** Fx → CSS px at 96 dpi (embed render page size). */
export const fxToCssPx = (fx: number) => ((fx / FX) * 96) / 72

/** What `renderEmbed` needs from a record; `undefined` for a malformed one. */
export function embedTarget(
	rec: Partial<EmbedRecord> | undefined
): { appId: string; owner: string; fileId: string; contentType: string; nav?: string } | undefined {
	const r = typeof rec?.address === 'string' ? parseDocRef(rec.address) : null
	if (!r) return
	// content type assumed `cloudillo/<appId>`; store it in the record if a mime
	// mapping ever differs.
	return {
		appId: r.appId,
		owner: r.resId.slice(0, r.resId.indexOf(':')),
		fileId: r.resId.slice(r.resId.indexOf(':') + 1),
		contentType: `cloudillo/${r.appId}`,
		nav: r.nav
	}
}

/**
 * A new record for a picked / pasted document, its natural size from one render at natural size
 * (400×300 px if that fails). `'reflow'` for Quillo / Notillo: show {@link REFLOW_NOTICE}.
 * `owner` is the document's owner idTag (the picker browses this document's context).
 */
export async function newEmbedRecord(
	pick: DocLinkResult,
	opts: { owner: string; sourceFileId: string; sizing: EmbedSizing }
): Promise<EmbedRecord | 'reflow'> {
	const appId = pick.appId || pick.contentType.replace(/^cloudillo\//, '')
	if (isReflowApp(appId)) return 'reflow'
	let lastNatural = DEFAULT_NATURAL
	try {
		const { natural } = await renderEmbed({
			bus: getAppBus(),
			targetFileId: pick.fileId,
			targetContentType: pick.contentType,
			sourceFileId: opts.sourceFileId,
			nav: pick.nav
		})
		if (natural.w > 0 && natural.h > 0) lastNatural = { w: natural.w, h: natural.h }
	} catch (err) {
		console.warn('[pagillo] embed render for its size failed:', err)
	}
	return {
		address: docRef(appId, `${opts.owner}:${pick.fileId}`, pick.nav),
		linkType: 'view',
		sizing: opts.sizing,
		lastNatural,
		lastTitle: pick.fileName,
		editInPlace: true,
		// Should be the source's a11yLabel; neither the picker nor renderEmbed returns one.
		alt: pick.fileName
	}
}

// vim: ts=4
