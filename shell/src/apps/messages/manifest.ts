// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'messages',
	name: 'Messages',
	version: pkg.version,
	kind: 'internal',
	icon: 'messages-square',
	defaultOrder: 40,
	translations: {
		hu: { name: 'Üzenetek' }
	}
}

// vim: ts=4
