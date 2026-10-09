// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for requesting and managing embedded document lifecycle.
 *
 * Calls bus.requestEmbed() to obtain a scoped token and embed URL,
 * then constructs the full iframe src with the appropriate hash.
 */

import { EMBED_ERR_CYCLE, EMBED_ERR_DEPTH, getAppBus } from '@cloudillo/core'
import * as React from 'react'

export interface UseDocumentEmbedOptions {
	targetFileId: string
	targetContentType: string
	sourceFileId: string
	access?: 'read' | 'comment' | 'write'
	navState?: string
	/** Launch params for the embedded app (sent as a query string) */
	params?: Record<string, string>
}

export interface DocumentEmbedState {
	status: 'loading' | 'ready' | 'error'
	iframeSrc?: string
	error?: string
	/** The shell refused the embed for nesting too deep or containing itself */
	reason?: 'nested'
}

/** The `reason` an `embed:open.req` error message stands for, if any */
export function embedErrorReason(message: string | undefined): 'nested' | undefined {
	return message === EMBED_ERR_DEPTH || message === EMBED_ERR_CYCLE ? 'nested' : undefined
}

export function useDocumentEmbed(options: UseDocumentEmbedOptions | null): DocumentEmbedState {
	const [state, setState] = React.useState<DocumentEmbedState>({ status: 'loading' })

	// Serialize options to a stable key so we re-request only when they change
	// navState changes should NOT trigger a re-request of the embed URL
	// (navState is delivered via the embed:view.set message, not via re-loading the iframe)
	const params = options?.params ? new URLSearchParams(options.params).toString() : undefined
	const optionsKey = options
		? `${options.targetFileId}:${options.targetContentType}:${options.sourceFileId}:${options.access ?? 'read'}:${params ?? ''}`
		: null

	React.useEffect(() => {
		if (!options || !optionsKey) {
			setState({ status: 'loading' })
			return
		}

		let cancelled = false
		setState({ status: 'loading' })

		;(async () => {
			try {
				const bus = getAppBus()
				const result = await bus.requestEmbed({
					targetFileId: options.targetFileId,
					targetContentType: options.targetContentType,
					sourceFileId: options.sourceFileId,
					access: options.access,
					navState: options.navState,
					params
				})

				if (cancelled) return

				const hash = result.resId
					? `${result.resId}:_embed:${result.nonce}`
					: `_embed:${result.nonce}`
				const iframeSrc = `${result.embedUrl}?v=1#${hash}`

				setState({ status: 'ready', iframeSrc })
			} catch (err) {
				if (cancelled) return
				console.error('[useDocumentEmbed] Failed to request embed:', err)
				const error = err instanceof Error ? err.message : 'Failed to load embed'
				setState({ status: 'error', error, reason: embedErrorReason(error) })
			}
		})()

		return () => {
			cancelled = true
		}
	}, [optionsKey])

	return state
}

// vim: ts=4
