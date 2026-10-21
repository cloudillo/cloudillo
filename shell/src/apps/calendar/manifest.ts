// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppManifest } from '@cloudillo/types'

import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'calendar',
	name: 'Calendar',
	version: pkg.version,
	kind: 'internal',
	crossContext: true,
	icon: 'calendar',
	defaultOrder: 60,
	translations: {
		hu: { name: 'Naptár' }
	}
}

// vim: ts=4
