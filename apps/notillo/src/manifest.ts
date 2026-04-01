// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'notillo',
	name: 'Notillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/notillo/index.html',
	icon: 'book-open',
	description: 'Collaborative wiki and notes',
	contentTypes: [
		{
			mimeType: 'cloudillo/notillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			importFrom: [{ mimeType: 'text/markdown', label: 'Markdown', extensions: ['.md'] }]
		}
	],
	capabilities: ['rtdb', 'crdt'],
	translations: {
		hu: { description: 'Valós idejű wiki és jegyzetek' }
	}
}

// vim: ts=4
