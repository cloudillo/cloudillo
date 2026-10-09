// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index a calcillo document for full-text search.
 *
 * One part, keyed by the Yjs root `src/ydoc-helpers.ts` opens —
 * `yDoc.getMap('sheets')`. Each key of that map is a sheet id, so the indexer
 * emits one row per sheet. `sheetOrder` and `meta` carry no prose and are left
 * undeclared.
 *
 * `title` is the sheet's `Y.Text` name, which materialises as a plain string.
 * `body` walks `rows` (`rows.<rowId>.<colId>` holds a FortuneSheet `Cell`) and
 * collects string leaves only, so numeric cells contribute nothing.
 *
 * `keys: ['v']` allowlists the one key that holds typed text: a cell's own `v`
 * and a rich-text segment's `ct.s[].v` are both spelled `v`. Everything else in a
 * `Cell` is dropped by omission — `f` (formula source), `ct.fa` / `ct.t` (number
 * format), `bg` / `fc` (colours), `ff` (font family), and any key FortuneSheet
 * adds in a future release, which a denylist pinned to one version of its `Cell`
 * type could not promise. Row and column ids are data, not schema, so the walk
 * still descends every object; only the leaves are gated.
 *
 * `$.rows..v` would say the same more directly and fits the server's JSONPath
 * node cap, but the walk matches every cell in one pass instead of one match per
 * non-empty cell, and is subject to no node cap at all.
 *
 * No `navParam`: a hit opens the document, not the matching sheet.
 *
 * **Editing these rules requires bumping `formatVersion` below** (the index
 * contract's version, not `pkg.version`). The server orders registrations by it
 * and reindexes only when the rules change, so an unbumped edit is invisible on
 * any device that already registered the old rules.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [
		{
			kind: 'sheets',
			title: ['name'],
			body: [{ path: 'rows', extract: 'text', keys: ['v'] }]
		}
	]
}

export const manifest: AppManifest = {
	id: 'calcillo',
	name: 'Calcillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/calcillo/index.html',
	icon: 'table',
	description: 'Collaborative spreadsheet',
	contentTypes: [
		{
			mimeType: 'cloudillo/calcillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			importFrom: [
				{
					mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					label: 'Excel Spreadsheet',
					extensions: ['.xlsx']
				}
			],
			storeTp: 'CRDT',
			// The document format is unchanged; the patch bump records the index
			// rules switching to an allowlist, which the server reindexes on.
			formatVersion: '1.0.1',
			search: SEARCH_INDEX_RULES,
			// Ranges (`range:…`) and named ranges (`name:<id>`) embed at their natural pixel size
			embed: { view: 'fixed', namedViews: true }
		}
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Valós idejű táblázatkezelő' }
	}
}

// vim: ts=4
