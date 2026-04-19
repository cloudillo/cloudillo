// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'contacts',
	name: 'Contacts',
	version: pkg.version,
	kind: 'internal',
	icon: 'contact',
	defaultOrder: 65,
	translations: {
		hu: { name: 'Névjegyek' }
	}
}

// vim: ts=4
