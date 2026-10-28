// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `RichText` mention pills: `@idTag` / `@all` at a word start, never inside an e-mail.
 */

import { jest } from '@jest/globals'
import { render } from '@testing-library/react'
import * as React from 'react'

// The person card pulls in the whole profile stack; the pill is all that matters here.
jest.unstable_mockModule('../components/Person/PersonHover.js', () => ({
	PersonHover: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const { RichText } = await import('../components/RichText/RichText.js')

function pills(text: string): string[] {
	const { container } = render(<RichText text={text} mentions allowAll />)
	return [...container.querySelectorAll('.c-tag')].map((el) => el.textContent ?? '')
}

describe('RichText mentions', () => {
	it('pills idTags and @all', () => {
		expect(pills('hi @bob.example.org and @all')).toEqual(['@bob.example.org', '@all'])
	})

	it('reads @all.example.org as an idTag, but keeps a sentence dot off @all', () => {
		expect(pills('ping @all.example.org')).toEqual(['@all.example.org'])
		expect(pills('hi @all.')).toEqual(['@all'])
	})

	it('leaves @all as plain text without allowAll', () => {
		const { container } = render(<RichText text="hi @all" mentions />)
		expect(container.querySelectorAll('.c-tag')).toHaveLength(0)
		expect(container.textContent).toBe('hi @all')
	})

	it('leaves an e-mail alone', () => {
		expect(pills('mail bob@x.org')).toEqual([])
	})

	it('pills adjacent mentions and keeps the text around them', () => {
		const { container } = render(<RichText text="@a.bc @d.ef!" mentions />)
		expect([...container.querySelectorAll('.c-tag')].map((el) => el.textContent)).toEqual([
			'@a.bc',
			'@d.ef'
		])
		expect(container.textContent).toBe('@a.bc @d.ef!')
	})
})

// vim: ts=4
