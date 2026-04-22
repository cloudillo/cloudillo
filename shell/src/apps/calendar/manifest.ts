// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'calendar',
	name: 'Calendar',
	version: pkg.version,
	kind: 'internal',
	icon: 'calendar',
	defaultOrder: 60,
	translations: {
		hu: { name: 'Naptár' }
	}
}

// vim: ts=4
