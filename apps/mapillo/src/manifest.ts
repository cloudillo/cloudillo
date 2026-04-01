// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'mapillo',
	name: 'Mapillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/mapillo/index.html',
	icon: 'map',
	description: 'Map application',
	contentTypes: [{ mimeType: 'cloudillo/mapillo', actions: ['view'], priority: 'primary' }],
	defaultOrder: 60,
	capabilities: ['sensor'],
	translations: {
		hu: { name: 'Térkép', description: 'Térkép alkalmazás' }
	}
}

// vim: ts=4
