// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'taskillo',
	name: 'Taskillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/taskillo/index.html',
	icon: 'list-checks',
	description: 'Collaborative task list',
	contentTypes: [
		{ mimeType: 'cloudillo/taskillo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	capabilities: ['rtdb'],
	translations: {
		hu: { description: 'Valós idejű feladatlista' }
	}
}

// vim: ts=4
