// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/core'

import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'pagillo',
	name: 'Pagillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/pagillo/index.html',
	icon: 'file-text',
	description: 'Collaborative page layout and publishing',
	// Same-origin sandbox: the layout engine needs a module Worker and fetched WASM.
	requiresTrusted: true,
	contentTypes: [
		{
			mimeType: 'cloudillo/pagillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			storeTp: 'CRDT',
			formatVersion: '1.0.0'
		}
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Közös oldaltördelés és kiadványszerkesztés' }
	}
}

// vim: ts=4
