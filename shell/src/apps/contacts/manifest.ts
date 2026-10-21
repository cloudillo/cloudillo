// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppManifest } from '@cloudillo/types'

import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'contacts',
	name: 'Contacts',
	version: pkg.version,
	kind: 'internal',
	crossContext: true,
	icon: 'contact',
	defaultOrder: 65,
	translations: {
		hu: { name: 'Névjegyek' }
	}
}

// vim: ts=4
