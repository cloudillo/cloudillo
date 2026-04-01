// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'scanillo',
	name: 'Scanillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/scanillo/index.html',
	icon: 'scan',
	description: 'Document scanner',
	contentTypes: [
		{ mimeType: 'cloudillo/scanillo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	launchModes: [
		{
			id: 'scan',
			label: 'Scan',
			description: 'Capture document with camera',
			translations: {
				hu: { label: 'Szkennelés', description: 'Dokumentum rögzítés kamerával' }
			}
		}
	],
	capabilities: ['camera', 'media'],
	translations: {
		hu: { description: 'Dokumentum szkenner' }
	}
}

// vim: ts=4
