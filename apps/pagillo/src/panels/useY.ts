// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'
import type * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'

/**
 * Re-render on any change to the publication's settings roots (`m st ms secs s`), observed deep:
 * edits inside nested entity `Y.Map`s do not fire a root's shallow observer. Story text (`tx`)
 * and frames (`f`) are not watched.
 */
export function useDocVersion(doc: YPagilloDocument): number {
	const [v, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const roots = [doc.m, doc.st, doc.ms, doc.secs, doc.s] as Y.AbstractType<unknown>[]
		const f = () => bump()
		for (const r of roots) r.observeDeep(f)
		return () => {
			for (const r of roots) r.unobserveDeep(f)
		}
	}, [doc])
	return v
}

// vim: ts=4
