// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `window-management` (screen enumeration) is only delegated to a trusted frame whose
 * manifest asks for presentation — never to every app.
 */

import { render } from '@testing-library/react'
import * as React from 'react'

import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

await mockRealCore()
await mockCloudilloReact()
mockI18n()

const { AppFrame } = await import('../ui/AppFrame.js')

const ALLOW = 'clipboard-read; fullscreen'

function allowOf(el: HTMLElement): string | null {
	return el.querySelector('iframe')?.getAttribute('allow') ?? null
}

describe('AppFrame allow', () => {
	it('an untrusted frame does not get window-management, even with presentation', () => {
		const { container } = render(<AppFrame trust="untrusted" allowPresentation allow={ALLOW} />)
		expect(allowOf(container)).toBe(ALLOW)
	})

	it('a trusted frame without presentation does not get it', () => {
		const { container } = render(<AppFrame trust="trusted" allow={ALLOW} />)
		expect(allowOf(container)).toBe(ALLOW)
	})

	it('a trusted presentation frame gets it', () => {
		const { container } = render(<AppFrame trust="trusted" allowPresentation allow={ALLOW} />)
		expect(allowOf(container)).toBe(`${ALLOW}; window-management`)
	})
})

// vim: ts=4
