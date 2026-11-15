// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `useBackupState`: `backup.changed` re-fetches, and a fetch that resolves after a
 * mutation result does not overwrite it.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'

import type { BackupState } from '../native-bridge.js'

jest.unstable_mockModule('@cloudillo/core', () => ({ getApiClient: () => ({}) }))
jest.unstable_mockModule('@cloudillo/react', () => ({ useToast: () => ({}) }))
jest.unstable_mockModule('../context/hooks.js', () => ({ useApiContext: () => ({}) }))

interface Req {
	id: number
	method: string
}
let sent: Req[] = []
const native = {
	postMessage(m: string) {
		sent.push(JSON.parse(m))
	},
	onmessage: null as ((evt: MessageEvent) => void) | null
}
window.CloudilloNative = native

const { useBackupState } = await import('../native-bridge.js')

function send(msg: object) {
	native.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent)
}

/** Answers the oldest pending request for `method`. */
async function answer(method: string, result: unknown) {
	await act(async () => {
		for (let i = 0; i < 50 && !sent.some((s) => s.method === method); i++) {
			await Promise.resolve()
		}
		const r = sent.find((s) => s.method === method)
		if (!r) throw new Error(`no ${method} request`)
		sent.splice(sent.indexOf(r), 1)
		send({ id: r.id, result })
	})
}

const HELLO = { bridgeVersion: 1, appVersion: '1', deviceName: 'P', idTag: 'a.tld' }
const st = (running: boolean) => ({ running }) as BackupState

beforeEach(() => {
	sent = []
})

describe('useBackupState', () => {
	it('re-fetches on backup.changed', async () => {
		const { result } = renderHook(() => useBackupState())
		await answer('hello', HELLO)
		await answer('backup.getState', st(false))
		expect(result.current.state?.running).toBe(false)
		act(() => send({ event: 'backup.changed' }))
		await answer('backup.getState', st(true))
		expect(result.current.state?.running).toBe(true)
	})

	it('a mutation result wins over an in-flight fetch', async () => {
		const { result } = renderHook(() => useBackupState())
		// hello is cached from the test above
		act(() => result.current.setState(st(true)))
		await answer('backup.getState', st(false))
		expect(result.current.state?.running).toBe(true)
	})
})

// vim: ts=4
