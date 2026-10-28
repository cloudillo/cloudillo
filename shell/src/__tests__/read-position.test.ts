// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Live re-probe target selection and the Home → community watermark carryover.
 */

import type { ApiClient } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { createStore } from 'jotai'

import {
	liveProbeTargets,
	parseScopeKey,
	readPositionAtom,
	seedCommunityFromHome
} from '../read-position.js'

const ME = 'me.test'

describe('liveProbeTargets', () => {
	const showInHome = new Map([
		['hidden.test', false],
		['shown.test', true]
	])

	it('probes own home, known communities, and skips anyone else', () => {
		expect(
			liveProbeTargets([ME, 'hidden.test', 'shown.test', 'person.test'], ME, showInHome)
		).toEqual([
			{ idTag: ME, isCommunity: false, knocksOnly: false },
			{ idTag: 'hidden.test', isCommunity: true, knocksOnly: false },
			{ idTag: 'shown.test', isCommunity: true, knocksOnly: true }
		])
	})

	it('probes every target as a full community before the list loads', () => {
		expect(liveProbeTargets([ME, 'comm.test'], ME, new Map())).toEqual([
			{ idTag: ME, isCommunity: false, knocksOnly: false },
			{ idTag: 'comm.test', isCommunity: true, knocksOnly: false }
		])
	})
})

describe('seedCommunityFromHome', () => {
	const C = 'comm.test'

	function setup(home: number, community?: number) {
		const store = createStore()
		store.set(readPositionAtom, {
			[`feed:${ME}`]: home,
			...(community !== undefined && { [`feed:${C}`]: community })
		})
		const patch = jest.fn(async () => {})
		const api = { readerState: { patch } } as unknown as ApiClient
		return { store, patch, api }
	}

	it('raises a lower community watermark and persists it', () => {
		const { store, patch, api } = setup(2000, 1000)
		seedCommunityFromHome(store, api, C, ME)
		expect(store.get(readPositionAtom)[`feed:${C}`]).toBe(2000)
		expect(patch).toHaveBeenCalledWith('P:POST', C, {
			readAt: new Date(2000 * 1000).toISOString()
		})
	})

	it('never lowers the community watermark', () => {
		const { store, api } = setup(1000, 2000)
		seedCommunityFromHome(store, api, C, ME)
		expect(store.get(readPositionAtom)[`feed:${C}`]).toBe(2000)
	})

	it('is a no-op without a Home watermark', () => {
		const { store, patch, api } = setup(0, 500)
		seedCommunityFromHome(store, api, C, ME)
		expect(store.get(readPositionAtom)[`feed:${C}`]).toBe(500)
		expect(patch).not.toHaveBeenCalled()
	})
})

describe('parseScopeKey', () => {
	it('maps the known prefixes and throws on an unknown one', () => {
		expect(parseScopeKey('feed:a.test')).toEqual({ kind: 'P:POST', key: 'a.test' })
		expect(parseScopeKey('msg:b.test')).toEqual({ kind: 'P:MSG', key: 'b.test' })
		expect(parseScopeKey('thread:x:y')).toEqual({ kind: 'A', key: 'x:y' })
		expect(parseScopeKey('')).toEqual({ kind: 'P:POST', key: '' })
		expect(() => parseScopeKey('bogus:x')).toThrow('Unknown read scope')
	})
})

// vim: ts=4
