// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index a quillo document for full-text search.
 *
 * One part, because a quillo document is one flat text stream:
 * `yDoc.getText('doc')` in `src/quillo.ts`, and `kind` is that Yjs root name. The
 * CRDT materialiser turns a text root into a single entry at `doc/_` carrying the
 * whole stream, so a hit addresses the *document*, not a place inside it — hence
 * no `attachTo`, `order`, `anchor`, `parent` or `navParam`.
 *
 * `t` is the text; `h` is its first line, derived by the materialiser because
 * quillo keeps no title field anywhere, without which every hit would render as
 * "Untitled".
 *
 * No `limits` block: a manifest may only *lower* the server's ceilings, so the
 * defaults already are the maximum.
 *
 * **Editing these rules requires bumping `formatVersion` below** (the index
 * contract's version, not `pkg.version`). The server orders the formats it loads
 * by it and reindexes only when the rules change, so an unbumped edit is
 * invisible wherever the old rules are already in effect.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [{ kind: 'doc', title: ['h'], body: ['t'] }]
}

export const manifest: AppManifest = {
	id: 'quillo',
	name: 'Quillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/quillo/index.html',
	icon: 'file-text',
	description: 'Rich text editor with real-time collaboration',
	contentTypes: [
		{
			mimeType: 'cloudillo/quillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			importFrom: [{ mimeType: 'text/markdown', label: 'Markdown', extensions: ['.md'] }],
			storeTp: 'CRDT',
			// Major.minor is the document-format contract itself; patch counts
			// compatible tweaks to the rules above.
			formatVersion: '1.0.0',
			search: SEARCH_INDEX_RULES,
			embed: { view: 'reflow', namedViews: true }
		}
	],
	capabilities: ['crdt', 'storage'],
	translations: {
		hu: { description: 'Valós idejű szövegszerkesztő' }
	}
}

// vim: ts=4
