// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'ideallo',
	name: 'Ideallo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/ideallo/index.html',
	icon: 'pen-line',
	description: 'Collaborative whiteboard',
	contentTypes: [
		{ mimeType: 'cloudillo/ideallo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Valós idejű rajztábla' }
	}
}

// vim: ts=4
