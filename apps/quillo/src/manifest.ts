// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

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
			importFrom: [{ mimeType: 'text/markdown', label: 'Markdown', extensions: ['.md'] }]
		}
	],
	capabilities: ['crdt', 'storage'],
	translations: {
		hu: { description: 'Valós idejű szövegszerkesztő' }
	}
}

// vim: ts=4
