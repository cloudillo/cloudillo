// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'

/**
 * Re-render on any change to the publication's settings roots (`m st ms secs s`). Shallow
 * observers suffice: their values are plain JSON, replaced whole by the crdt ops. Story text
 * (`tx`) and frames (`f`) are not watched.
 */
export function useDocVersion(doc: YPagilloDocument): number {
	const [v, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const roots = [doc.m, doc.st, doc.ms, doc.secs, doc.s] as Y.AbstractType<unknown>[]
		const f = () => bump()
		for (const r of roots) r.observe(f)
		return () => {
			for (const r of roots) r.unobserve(f)
		}
	}, [doc])
	return v
}

// vim: ts=4
