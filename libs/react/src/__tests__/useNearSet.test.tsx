// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { useNearSet } from '../hooks.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderHook<T>(hook: () => T): { result: { current: T }; unmount: () => void } {
	const container = document.createElement('div')
	const root = createRoot(container)
	const result = { current: undefined as unknown as T }
	function Probe() {
		result.current = hook()
		return null
	}
	act(() => {
		root.render(React.createElement(Probe))
	})
	return {
		result,
		unmount: () =>
			act(() => {
				root.unmount()
			})
	}
}

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void

let observer: { callback: IOCallback; observed: Element[]; disconnect: jest.Mock }

class FakeIntersectionObserver {
	observed: Element[] = []
	disconnect = jest.fn()
	constructor(public callback: IOCallback) {
		observer = this
	}
	observe(el: Element) {
		this.observed.push(el)
	}
}

describe('useNearSet', () => {
	const realIO = globalThis.IntersectionObserver
	beforeAll(() => {
		;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
			FakeIntersectionObserver
	})
	afterAll(() => {
		globalThis.IntersectionObserver = realIO
	})

	it('tracks intersecting keys and disconnects on unmount', () => {
		const el = document.createElement('div')
		el.innerHTML = '<div data-k="a"></div><div data-k="b"></div>'
		const ref = { current: el }

		const { result, unmount } = renderHook(() => useNearSet(ref, '[data-k]', 'k', []))
		expect(observer.observed).toHaveLength(2)
		const [a] = observer.observed

		act(() => observer.callback([{ target: a, isIntersecting: true }]))
		expect([...result.current]).toEqual(['a'])

		act(() => observer.callback([{ target: a, isIntersecting: false }]))
		expect(result.current.size).toBe(0)

		unmount()
		expect(observer.disconnect).toHaveBeenCalled()
	})
})

// vim: ts=4
