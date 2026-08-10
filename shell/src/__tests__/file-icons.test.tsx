// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `getFileIcon` looks a content type up in a plain object literal, so the lookup has
 * to be an own-property check. `contentType` arrives from federated file metadata and
 * is rendered as a component — a prototype hit like `'constructor'` returns `Object`,
 * which React calls and then throws "Objects are not valid as a React child" on,
 * taking the whole result list down.
 */

import { getFileIcon } from '../apps/files/icons.js'

describe('getFileIcon', () => {
	it('does not resolve prototype keys to their prototype values', () => {
		const unknown = getFileIcon('application/x-nonexistent')
		for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
			expect(getFileIcon(key)).toBe(unknown)
		}
	})

	it('still resolves the real entries', () => {
		expect(getFileIcon('cloudillo/notillo')).not.toBe(getFileIcon('application/x-nonexistent'))
		expect(getFileIcon('anything', 'FLDR')).toBe(getFileIcon('cloudillo/folder'))
	})
})

// vim: ts=4
