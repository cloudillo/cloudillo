// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { cleanExportUrl, isSafeLink } from '../export/links.js'

describe('cleanExportUrl', () => {
	it('strips the token from an absolute URL', () => {
		expect(cleanExportUrl('https://cl-o.a.b/api/files/f1?token=x&v=1', 'src')).toBe(
			'https://cl-o.a.b/api/files/f1?v=1'
		)
	})

	it('strips the token from a relative URL', () => {
		expect(cleanExportUrl('/api/files/f1?token=x#top', 'src')).toBe('/api/files/f1#top')
		expect(cleanExportUrl('../a?token=x&v=1', 'src')).toBe('../a?v=1')
		expect(cleanExportUrl('//host/p?token=x', 'src')).toBe('//host/p')
	})

	it('keeps relative and anchor links as written', () => {
		expect(cleanExportUrl('#anchor', 'href')).toBe('#anchor')
		expect(cleanExportUrl('../a.html', 'href')).toBe('../a.html')
		expect(cleanExportUrl('a#b?token=1', 'href')).toBe('a#b?token=1')
		expect(cleanExportUrl('page&token=x', 'href')).toBe('page&token=x')
	})

	it('drops unsafe schemes', () => {
		expect(cleanExportUrl('javascript:alert(1)', 'href')).toBeUndefined()
	})

	it('keeps data images for src only', () => {
		const data = 'data:image/png;base64,iVBORw0KGgo='
		expect(cleanExportUrl(data, 'src')).toBe(data)
		expect(cleanExportUrl(data, 'href')).toBeUndefined()
	})

	it('keeps mailto links', () => {
		expect(cleanExportUrl('mailto:a@b.c', 'href')).toBe('mailto:a@b.c')
	})
})

describe('isSafeLink', () => {
	it('accepts absolute safe schemes only', () => {
		expect(isSafeLink('https://a.b')).toBe(true)
		expect(isSafeLink('javascript:alert(1)')).toBe(false)
		expect(isSafeLink('#anchor')).toBe(false)
	})
})

// vim: ts=4
