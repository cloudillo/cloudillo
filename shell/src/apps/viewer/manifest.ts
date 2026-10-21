// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppManifest } from '@cloudillo/types'

import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'view',
	name: 'Viewer',
	version: pkg.version,
	kind: 'internal',
	icon: 'eye',
	contentTypes: [
		{ mimeType: 'image/jpeg', actions: ['view'], priority: 'primary' },
		{ mimeType: 'image/png', actions: ['view'], priority: 'primary' },
		{ mimeType: 'image/gif', actions: ['view'], priority: 'primary' },
		{ mimeType: 'image/webp', actions: ['view'], priority: 'primary' },
		{ mimeType: 'image/svg+xml', actions: ['view'], priority: 'primary' },
		{ mimeType: 'video/mp4', actions: ['view'], priority: 'primary' },
		{ mimeType: 'video/webm', actions: ['view'], priority: 'primary' },
		{ mimeType: 'application/pdf', actions: ['view'], priority: 'primary' }
	]
}

// vim: ts=4
