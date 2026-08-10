// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index a taskillo document for full-text search.
 *
 * One part, keyed by the RTDB collection `src/app.tsx` opens —
 * `client.collection('tasks')`. One index row per task.
 *
 * `text` is the whole of a task's content and fits a title, so there is no
 * separate `body`: a snippet would only repeat the title. The remaining fields
 * are not prose (`completed` a bool, `createdAt` a timestamp).
 *
 * No `navParam`: a hit opens the document, not the matching task.
 *
 * **Editing these rules requires bumping `formatVersion` below** (the index
 * contract's version, not `pkg.version`). The server orders registrations by it
 * and reindexes only when the rules change, so an unbumped edit is invisible on
 * any device that already registered the old rules.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [{ kind: 'tasks', title: ['text'] }]
}

export const manifest: AppManifest = {
	id: 'taskillo',
	name: 'Taskillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/taskillo/index.html',
	icon: 'list-checks',
	description: 'Collaborative task list',
	contentTypes: [
		{
			mimeType: 'cloudillo/taskillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			storeTp: 'RTDB',
			// Major.minor is the document-format contract itself; patch counts
			// compatible tweaks to the rules above.
			formatVersion: '1.0.0',
			search: SEARCH_INDEX_RULES
		}
	],
	capabilities: ['rtdb'],
	translations: {
		hu: { description: 'Valós idejű feladatlista' }
	}
}

// vim: ts=4
