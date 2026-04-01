// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

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
			]
		}
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Valós idejű táblázatkezelő' }
	}
}

// vim: ts=4
