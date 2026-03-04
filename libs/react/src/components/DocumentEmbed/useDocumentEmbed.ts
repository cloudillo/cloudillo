// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Hook for requesting and managing embedded document lifecycle.
 *
 * Calls bus.requestEmbed() to obtain a scoped token and embed URL,
 * then constructs the full iframe src with the appropriate hash.
 */

import * as React from 'react'
import { getAppBus } from '@cloudillo/core'

export interface UseDocumentEmbedOptions {
	targetFileId: string
	targetContentType: string
	sourceFileId: string
	access?: 'read' | 'write'
	navState?: string
}

export interface DocumentEmbedState {
	status: 'loading' | 'ready' | 'error'
	iframeSrc?: string
	error?: string
}

export function useDocumentEmbed(options: UseDocumentEmbedOptions | null): DocumentEmbedState {
	const [state, setState] = React.useState<DocumentEmbedState>({ status: 'loading' })

	// Serialize options to a stable key so we re-request only when they change
	// navState changes should NOT trigger a re-request of the embed URL
	// (navState is delivered via viewstate.set message, not via re-loading the iframe)
	const optionsKey = options
		? `${options.targetFileId}:${options.targetContentType}:${options.sourceFileId}:${options.access ?? 'read'}`
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
					navState: options.navState
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
				setState({
					status: 'error',
					error: err instanceof Error ? err.message : 'Failed to load embed'
				})
			}
		})()

		return () => {
			cancelled = true
		}
	}, [optionsKey])

	return state
}

// vim: ts=4
