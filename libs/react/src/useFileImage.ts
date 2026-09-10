// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The URL and load state of a stored image, for a canvas renderer — shared by ideallo's
 * and prezillo's `ImageRenderer`, which draw different SVG around the same state.
 */

import { getFileUrl, getImageVariantForDisplaySize } from '@cloudillo/core'
import * as React from 'react'

export type FileImageState = 'loading' | 'loaded' | 'error'

/**
 * @param displayWidth - Already scaled by the canvas zoom; the hook is scale-agnostic.
 * @param displayHeight - Likewise.
 */
export function useFileImage(
	ownerTag: string | undefined,
	fileId: string,
	displayWidth: number,
	displayHeight: number,
	token?: string
): { url: string | undefined; state: FileImageState } {
	const [loadState, setLoadState] = React.useState<FileImageState>('loading')

	const variant = React.useMemo(
		() => getImageVariantForDisplaySize(displayWidth, displayHeight),
		[displayWidth, displayHeight]
	)

	// No owner tag, no URL. A root-relative `/api/files/…` would now resolve against
	// `cl-o.<home idTag>` — a live API on the *viewer's* node, where a node-local fileId
	// can name an unrelated file of theirs. Better a visible error box.
	const url = React.useMemo(
		() =>
			ownerTag
				? getFileUrl(ownerTag, fileId, variant, token ? { token } : undefined)
				: undefined,
		[fileId, ownerTag, token, variant]
	)

	// Which *file* is on screen, as opposed to which rendition of it. A zoom that crosses a
	// variant threshold rewrites `url` but not this, and the rendition already painted holds.
	const fileKey = `${ownerTag ?? ''}|${fileId}|${token ?? ''}`
	const lastFileKey = React.useRef<string | undefined>(undefined)

	// ponytail: the probe and the SVG <image> are two requests for one URL. They share a
	// cache entry, so the second is a hit; if they ever diverged, a probe success with an
	// element failure would paint a blank at opacity 1. Upgrade path: go back to element
	// events plus a per-URL identity token compared inside the handler.
	React.useLayoutEffect(() => {
		const sameFile = lastFileKey.current === fileKey
		lastFileKey.current = fileKey
		if (!url) {
			setLoadState('error')
			return
		}
		// The probe IS the load signal. An SVG <image> does not reliably fire onLoad for an
		// already-cached href, and a load event on the shared element cannot be told apart
		// from one for the href it just replaced — both requests hit the same cache entry.
		let live = true
		const img = new Image()
		img.onload = () => {
			if (live) setLoadState('loaded')
		}
		img.onerror = () => {
			if (live) setLoadState('error')
		}
		img.src = url
		if (img.complete && img.naturalWidth > 0) setLoadState('loaded')
		else if (!sameFile) setLoadState('loading')
		return () => {
			live = false
			img.onload = null
			img.onerror = null
		}
	}, [url, fileKey])

	return { url, state: loadState }
}

// vim: ts=4
