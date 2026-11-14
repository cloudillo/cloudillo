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

	// Hard-coded copy of the server's untrusted-app CSP: cloudillo-rs
	// `crates/cloudillo-file/src/apkg.rs` `UNTRUSTED_APP_CSP`, which has the mirror test
	// `untrusted_csp_matches_fe_sandbox`. Change both sides together.
	it('matches the server untrusted-app CSP sandbox tokens', () => {
		const UNTRUSTED_APP_CSP =
			'sandbox allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'
		const tokens = (s: string) => s.split(/\s+/).filter(Boolean).sort()
		expect(tokens(APP_SANDBOX)).toEqual(tokens(UNTRUSTED_APP_CSP.replace(/^sandbox\s+/, '')))
	})
})

// vim: ts=4
