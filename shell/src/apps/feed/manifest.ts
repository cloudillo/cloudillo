// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppManifest } from '@cloudillo/types'

import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'feed',
	name: 'Feed',
	version: pkg.version,
	kind: 'internal',
	crossContext: true,
	icon: 'list',
	defaultOrder: 20,
	translations: {
		hu: { name: 'Hírfolyam' }
	}
}

// vim: ts=4
