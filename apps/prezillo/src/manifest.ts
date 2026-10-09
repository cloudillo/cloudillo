// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index a prezillo document for full-text search.
 *
 * Two emitting parts, both keyed by Yjs roots `src/crdt/document.ts` opens. The
 * backend namespaces `partId` by kind, so `rt/<objectId>` and `v/<viewId>` cannot
 * collide.
 *
 * `rt` (`yDoc.getMap('rt')`) is rich text box content, keyed by object id — one
 * index row per text object. The empty `field` selects the whole document, which
 * for a `Y.Map<Y.Text>` entry *is* the text: `yrs` materialises a nested `Y.Text`
 * as a bare JSON string. `title` and `body` deliberately select the same text,
 * because a nested `Y.Text` gets no first-line `h` derivation (only a text *root*
 * does), so without a title every hit would render as "Untitled" and without a
 * body there would be no snippet.
 *
 * `v` (`yDoc.getMap('v')`) is the slides; `StoredView` carries `name` and
 * `notes`, making named slides and speaker notes findable. Default slide names
 * ("Page 1", …) produce low-value rows — accepted, in exchange for real slide
 * titles being searchable.
 *
 * Text objects cannot be folded into their slide with `attachTo`: that needs a
 * field on the *attached* document naming its owner, and an `rt` entry is a bare
 * string. (`StoredObjectBase.vi` records an object's view, but `o` holds no text.)
 *
 * No `navParam`: a hit opens the document, not the matching slide.
 *
 * **Editing these rules requires bumping `formatVersion` below** (the index
 * contract's version, not `pkg.version`). The server orders registrations by it
 * and reindexes only when the rules change, so an unbumped edit is invisible on
 * any device that already registered the old rules.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [
		{ kind: 'rt', title: [''], body: [''] },
		{ kind: 'v', title: ['name'], body: ['notes'] }
	]
}

export const manifest: AppManifest = {
	id: 'prezillo',
	name: 'Prezillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/prezillo/index.html',
	icon: 'presentation',
	description: 'Collaborative presentations',
	contentTypes: [
		{
			mimeType: 'cloudillo/prezillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			importFrom: [
				{
					mimeType:
						'application/vnd.openxmlformats-officedocument.presentationml.presentation',
					label: 'PowerPoint Presentation',
					extensions: ['.pptx']
				}
			],
			storeTp: 'CRDT',
			embed: { view: 'fixed', namedViews: true },
			// Major.minor is the document-format contract itself; patch counts
			// compatible tweaks to the rules above.
			formatVersion: '1.0.0',
			search: SEARCH_INDEX_RULES
		}
	],
	launchModes: [
		{
			id: 'present',
			label: 'Present',
			description: 'Full-screen presentation mode',
			translations: {
				hu: { label: 'Vetítés', description: 'Teljes képernyős előadás mód' }
			}
		}
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Valós idejű prezentáció' }
	}
}

// vim: ts=4
