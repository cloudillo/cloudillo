// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

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
			]
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
