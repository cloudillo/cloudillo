// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Source-side React hooks for view embedding: read the host's layout, report the view.
 */

import {
	type EmbedViewLayoutPayload,
	type EmbedViewReportPayload,
	getAppBus,
	observeReflowView
} from '@cloudillo/core'
import * as React from 'react'

import { useToast } from './components/Toast/useToast.js'
import { naturalSizeChanged, storableNatural } from './components/ViewEmbed/sizing.js'
import { useLibTranslation } from './i18n.js'

/** The layout the host last sent (`embed:view.layout`), or undefined when none yet. */
export function useEmbedLayout(): EmbedViewLayoutPayload | undefined {
	const [layout, setLayout] = React.useState(() => getAppBus().viewLayout)
	React.useEffect(() => getAppBus().onViewLayout(setLayout), [])
	return layout
}

/** Report `report` to the host whenever it changes (by value). `null` reports nothing. */
export function useViewReport(report: EmbedViewReportPayload | null): void {
	const key = report ? JSON.stringify(report) : null
	React.useEffect(() => {
		if (report) getAppBus().reportView(report)
	}, [key])
}

/** Report a reflowing view measured from `ref`'s element, re-reporting on resize. */
export function useReflowViewReport(
	ref: React.RefObject<HTMLElement | null>,
	base: Omit<EmbedViewReportPayload, 'kind' | 'natural'>
): void {
	const key = JSON.stringify(base)
	React.useEffect(() => {
		const el = ref.current
		if (!el) return
		return observeReflowView(el, base)
	}, [key])
}

/**
 * Set the link share behind an embed's editable toggle; true when the toggle should be stored.
 * The share is per host/target document pair, so it is shared by every embed of `targetFileId`
 * in the host. `othersEditable`: another embed of `targetFileId` in this host still needs the
 * 'W' share, so turning this one off must not downgrade it.
 */
export async function grantEmbedEditable(
	targetFileId: string,
	sourceFileId: string,
	editable: boolean,
	othersEditable = false
): Promise<boolean> {
	if (!editable && othersEditable) return true
	return getAppBus().grantDocument(targetFileId, sourceFileId, editable ? 'write' : 'read')
}

/**
 * Natural size to store for an embed's view report, or null when unchanged beyond the
 * threshold. `stored.kind` is compared only when the host stores one.
 */
export function embedReportToStore(
	stored: { w: number; h: number; kind?: string },
	report: EmbedViewReportPayload
): { w: number; h: number; kind: 'fixed' | 'reflow' } | null {
	const n = storableNatural(report.natural)
	if (!n) return null
	const [w, h] = n
	const kindChanged = stored.kind !== undefined && stored.kind !== report.kind
	return naturalSizeChanged(stored, { w, h }) || kindChanged ? { w, h, kind: report.kind } : null
}

/**
 * Host-side handlers for embedded documents' report / "Use current view" / editable toggle.
 * The returned callbacks are stable; `opts` is read at call time.
 */
export function useDocumentEmbedHandlers(opts: {
	getFileId: () => string | undefined
	setAspect: (objectId: string, natural: [number, number], fixed: boolean) => void
	setNav: (objectId: string, nav: string) => void
	setEditable: (objectId: string, editable: boolean) => void
	/** Another embed than `objectId` of `targetFileId` in this host is editable */
	isOtherEditable?: (objectId: string, targetFileId: string) => boolean
}): {
	onReport: (objectId: string, report: EmbedViewReportPayload) => void
	onUseView: (objectId: string, nav: string) => void
	onEditable: (objectId: string, targetFileId: string, editable: boolean) => Promise<void>
} {
	const ref = React.useRef(opts)
	ref.current = opts
	const onReport = React.useCallback((objectId: string, report: EmbedViewReportPayload) => {
		const n = storableNatural(report.natural)
		if (n) ref.current.setAspect(objectId, n, report.kind === 'fixed')
	}, [])
	const onUseView = React.useCallback((objectId: string, nav: string) => {
		ref.current.setNav(objectId, nav)
	}, [])
	const onEditable = React.useCallback(
		async (objectId: string, targetFileId: string, editable: boolean) => {
			const fileId = ref.current.getFileId()
			if (!fileId) return
			const others = ref.current.isOtherEditable?.(objectId, targetFileId) ?? false
			if (await grantEmbedEditable(targetFileId, fileId, editable, others)) {
				ref.current.setEditable(objectId, editable)
			}
		},
		[]
	)
	return { onReport, onUseView, onEditable }
}

/**
 * Copy an embed link (`cl:` ref) to the clipboard and toast the outcome. Call the returned
 * function synchronously inside the click: the clipboard write needs the user-activation window.
 */
export function useCopyEmbedLink(): (ref: string) => void {
	const toast = useToast()
	const { t } = useLibTranslation()
	return React.useCallback(
		(ref: string) => {
			navigator.clipboard
				.writeText(ref)
				.then(() => toast.success(t('Embed link copied')))
				.catch((err: Error) => {
					console.error('Copy embed link failed', err)
					toast.error(t('Failed to copy embed link'))
				})
		},
		[toast, t]
	)
}

// vim: ts=4
