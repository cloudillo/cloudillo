// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index an ideallo document for full-text search.
 *
 * One part, keyed by the Yjs root `src/crdt/document.ts` opens —
 * `yDoc.getMap('txt')`. *All* prose on a board lives there, keyed by object id:
 * sticky notes, text labels and shape labels alike. `o` (objects) carries
 * geometry and style only, with no text field, so it stays undeclared. One index
 * row per text object; `partId` is the object id.
 *
 * The empty `field` selects the whole document, which for a `Y.Map<Y.Text>` entry
 * *is* the text: `yrs` materialises a nested `Y.Text` as a bare JSON string.
 *
 * `title` and `body` deliberately select the same text. A nested `Y.Text` gets no
 * first-line `h` derivation (only a text *root* does), so without a title every
 * hit would render as "Untitled" and without a body there would be no snippet.
 * The duplication is uniform across every row of this kind, so it does not skew
 * ranking within it.
 *
 * No `navParam`: a hit opens the document, not the matching object.
 *
 * **Editing these rules requires bumping `formatVersion` below** (the index
 * contract's version, not `pkg.version`). The server orders registrations by it
 * and reindexes only when the rules change, so an unbumped edit is invisible on
 * any device that already registered the old rules.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [{ kind: 'txt', title: [''], body: [''] }]
}

export const manifest: AppManifest = {
	id: 'ideallo',
	name: 'Ideallo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/ideallo/index.html',
	icon: 'pen-line',
	description: 'Collaborative whiteboard',
	contentTypes: [
		{
			mimeType: 'cloudillo/ideallo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			storeTp: 'CRDT',
			// Major.minor is the document-format contract itself; patch counts
			// compatible tweaks to the rules above.
			formatVersion: '1.0.0',
			search: SEARCH_INDEX_RULES
		}
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Valós idejű rajztábla' }
	}
}

// vim: ts=4
