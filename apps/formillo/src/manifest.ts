// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'formillo',
	name: 'Formillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/formillo/index.html',
	icon: 'clipboard-list',
	description: 'Surveys and forms',
	contentTypes: [
		{ mimeType: 'cloudillo/formillo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Kérdőívek és űrlapok' }
	}
}

// vim: ts=4
