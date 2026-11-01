// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { jest } from '@jest/globals'

import { parseProfileAddress, resolveProfileAddress } from '../profile/address.js'

const idTag = (t: string) => ({ kind: 'idTag', idTag: t })
const host = (h: string) => ({ kind: 'host', host: h })

describe('idTag shape', () => {
	it('accepts domains (lowercased) and rejects the rest', async () => {
		expect(await resolveProfileAddress('bob.org')).toBe('bob.org')
		expect(await resolveProfileAddress('a-b.c-d.example')).toBe('a-b.c-d.example')
		expect(await resolveProfileAddress('Bob.org')).toBe('bob.org')
		expect(await resolveProfileAddress('bob')).toBeNull()
		expect(await resolveProfileAddress('.bob.org')).toBeNull()
		expect(await resolveProfileAddress('bob.org.')).toBeNull()
		expect(await resolveProfileAddress('-bob.org')).toBeNull()
		expect(await resolveProfileAddress(`${'a'.repeat(250)}.org`)).toBeNull()
	})
})

describe('parseProfileAddress', () => {
	it('takes a bare idTag, with or without @, lowercased', () => {
		expect(parseProfileAddress('bob.org')).toEqual(idTag('bob.org'))
		expect(parseProfileAddress('  @bob.org ')).toEqual(idTag('bob.org'))
		expect(parseProfileAddress('Bob.ORG')).toEqual(idTag('bob.org'))
	})

	it.each(['', 'hello', 'a b', 'javascript:alert(1)', 'ftp://x.org', 'cl:quillo/bob.org:abc'])(
		'rejects %p',
		(input) => {
			expect(parseProfileAddress(input)).toBeNull()
		}
	)

	it('takes a QR payload', () => {
		expect(parseProfileAddress('cloudillo:id:bob.org')).toEqual(idTag('bob.org'))
		expect(parseProfileAddress('cloudillo:id:nope')).toBeNull()
	})

	it('reads the profile idTag out of a shell link', () => {
		expect(parseProfileAddress('https://alice.example/~/profile/bob.org/feed')).toEqual(
			idTag('bob.org')
		)
		expect(parseProfileAddress('https://alice.example/@comm.tld/profile/bob.org')).toEqual(
			idTag('bob.org')
		)
	})

	it('reads the community out of a context link', () => {
		expect(parseProfileAddress('https://alice.example/@comm.tld/feed')).toEqual(
			idTag('comm.tld')
		)
		expect(parseProfileAddress('https://alice.example/@comm.tld|mod/feed')).toEqual(
			idTag('comm.tld')
		)
	})

	it('falls back to the host for links that name no profile', () => {
		expect(parseProfileAddress('https://alice.example/~/profile/me')).toEqual(
			host('alice.example')
		)
		expect(parseProfileAddress('https://alice.example/s/abc123')).toEqual(host('alice.example'))
		expect(parseProfileAddress('http://localhost:8080/s/abc')).toBeNull()
	})

	it('takes a cl:/ path ref, but never a host from it', () => {
		expect(parseProfileAddress('cl:/~/profile/bob.org')).toEqual(idTag('bob.org'))
		expect(parseProfileAddress('cl:/~/profile/me')).toBeNull()
	})

	it('decodes encoded segments and survives bad encoding', () => {
		expect(parseProfileAddress('https://alice.example/~/profile/bob%2Eorg')).toEqual(
			idTag('bob.org')
		)
		expect(parseProfileAddress('https://alice.example/~/profile/%E0%A4%A')).toEqual(
			host('alice.example')
		)
	})
})

describe('resolveProfileAddress', () => {
	const stub = (impl: () => Promise<unknown>) => {
		const fn = jest.fn(impl)
		return { fn, fetchFn: fn as unknown as typeof fetch }
	}
	const ok = (body: () => unknown) => async () => ({ ok: true, json: async () => body() })

	it('returns an idTag without fetching', async () => {
		const { fn, fetchFn } = stub(ok(() => ({})))
		expect(await resolveProfileAddress('@bob.org', fetchFn)).toBe('bob.org')
		expect(fn).not.toHaveBeenCalled()
	})

	it('asks the host for its idTag', async () => {
		const { fn, fetchFn } = stub(ok(() => ({ idTag: 'Alice.org' })))
		expect(await resolveProfileAddress('https://cl-o.alice.example/s/x', fetchFn)).toBe(
			'alice.org'
		)
		expect(fn).toHaveBeenCalledWith('https://cl-o.alice.example/.well-known/cloudillo/id-tag')
	})

	it('returns null on a non-ok response', async () => {
		const { fetchFn } = stub(async () => ({ ok: false, json: async () => ({}) }))
		expect(await resolveProfileAddress('https://alice.example/s/x', fetchFn)).toBeNull()
	})

	it('returns null on bad JSON', async () => {
		const { fetchFn } = stub(
			ok(() => {
				throw new SyntaxError('bad json')
			})
		)
		expect(await resolveProfileAddress('https://alice.example/s/x', fetchFn)).toBeNull()
	})

	it('returns null when the JSON idTag is invalid', async () => {
		const { fetchFn } = stub(ok(() => ({ idTag: 'evil/path' })))
		expect(await resolveProfileAddress('https://alice.example/s/x', fetchFn)).toBeNull()
	})

	it('returns null on a network error and on unparseable input', async () => {
		const { fn, fetchFn } = stub(async () => {
			throw new TypeError('network')
		})
		expect(await resolveProfileAddress('https://alice.example/s/x', fetchFn)).toBeNull()
		expect(await resolveProfileAddress('hello', fetchFn)).toBeNull()
		expect(fn).toHaveBeenCalledTimes(1)
	})
})
