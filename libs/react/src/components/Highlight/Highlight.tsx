// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { SearchMatch } from '@cloudillo/core'
import * as React from 'react'

export interface HighlightProps {
	text: string
	/**
	 * Ranges to emphasise, as UTF-16 offsets into `text` — exactly what
	 * `text.slice()` takes. Order and overlap are normalised, so a caller may pass
	 * them as received.
	 */
	matches?: readonly SearchMatch[]
	/** Class on the emitted `<mark>`; apps override it to reach their own styling. */
	markClassName?: string
}

/**
 * Render `text` with the matched ranges emphasised.
 *
 * The ranges come from the server out of band, beside the snippet: there is
 * deliberately no markup in `text` to parse, since an in-band marker is ambiguous
 * with a document containing that marker literally. Emphasis goes through React
 * children, which escape by construction — nothing here belongs anywhere near
 * `dangerouslySetInnerHTML`.
 */
export function Highlight({
	text,
	matches,
	markClassName = 'c-search-mark'
}: HighlightProps): React.ReactElement {
	// Sorted, clamped, non-overlapping. The server emits ranges in order and FTS5
	// cannot nest them, but ranges and text arrive as separate fields with nothing
	// pairing them, so a malformed range must degrade to plain text rather than
	// scramble the output.
	const ranges = React.useMemo(() => {
		if (!matches?.length) return []
		const out: SearchMatch[] = []
		let cursor = 0
		for (const m of [...matches].sort((a, b) => a.start - b.start)) {
			const start = Math.max(cursor, Math.min(m.start, text.length))
			const end = Math.max(start, Math.min(m.end, text.length))
			if (end > start) {
				out.push({ start, end })
				cursor = end
			}
		}
		return out
	}, [matches, text])

	if (!ranges.length) return <>{text}</>

	const parts: React.ReactNode[] = []
	let at = 0
	for (const [i, r] of ranges.entries()) {
		if (r.start > at) parts.push(text.slice(at, r.start))
		parts.push(
			<mark key={i} className={markClassName}>
				{text.slice(r.start, r.end)}
			</mark>
		)
		at = r.end
	}
	if (at < text.length) parts.push(text.slice(at))
	return <>{parts}</>
}

// vim: ts=4
