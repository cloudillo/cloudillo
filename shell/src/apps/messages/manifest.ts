// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppManifest } from '@cloudillo/types'

import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'messages',
	name: 'Messages',
	version: pkg.version,
	kind: 'internal',
	crossContext: true,
	// No `defaultOrder`: messages is fixed chrome (the header's 💬 icon at every
	// breakpoint), not a pinnable app-menu slot.
	icon: 'messages-square',
	translations: {
		hu: { name: 'Üzenetek' }
	}
}

// vim: ts=4
