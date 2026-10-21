// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Module mocks the DOM suites share. Call each as a top-level `await` before the dynamic
 * `import()` of the module under test.
 */

import { jest } from '@jest/globals'

/** `libs/core/lib` can lag behind source; run the shell against core source */
export async function mockRealCore() {
	const core = await import('../../../../libs/core/src/index.js')
	jest.unstable_mockModule('@cloudillo/core', () => core)
	return core
}

/** The real `@cloudillo/react` source with `overrides` on top */
export async function mockCloudilloReact(overrides: Record<string, unknown> = {}) {
	const react = await import('../../../../libs/react/src/index.js')
	jest.unstable_mockModule('@cloudillo/react', () => ({ ...react, ...overrides }))
}

/** `t` returns its string fallback, or else the key */
export function mockI18n() {
	jest.unstable_mockModule('react-i18next', () => ({
		useTranslation: () => ({
			t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
			i18n: { language: 'en' }
		})
	}))
}

// vim: ts=4
