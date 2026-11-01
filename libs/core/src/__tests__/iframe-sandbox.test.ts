// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { APP_SANDBOX, APP_SANDBOX_TRUSTED, appSandbox } from '../iframe-sandbox.js'

describe('appSandbox', () => {
	it('adds allow-presentation only to a trusted frame that asks for it', () => {
		expect(appSandbox(false, { presentation: true })).toBe(APP_SANDBOX)
		expect(appSandbox(true)).toBe(APP_SANDBOX_TRUSTED)
		expect(appSandbox(true)).not.toContain('allow-presentation')
		expect(appSandbox(true, { presentation: true })).toBe(
			`${APP_SANDBOX_TRUSTED} allow-presentation`
		)
	})

	it('never gives an untrusted frame the same origin', () => {
		expect(APP_SANDBOX).not.toContain('allow-same-origin')
	})
})

// vim: ts=4
