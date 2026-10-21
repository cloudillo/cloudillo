// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Audit helpers: the filter → query mapping, `useAuditLog` paging (and dropping stale
 * responses), and the category switches.
 */

import { jest } from '@jest/globals'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import * as React from 'react'

import { mockCloudilloReact, mockRealCore } from './helpers/mocks.js'

const toast = { error: jest.fn(), success: () => {}, info: () => {}, warning: () => {} }

await mockRealCore()
await mockCloudilloReact({ useToast: () => toast })

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, string>) =>
			key.replace(/{{(\w+)}}/g, (_, k) => opts?.[k] ?? ''),
		i18n: { language: 'en' }
	})
}))

const { AuditCategorySwitches, AuditFilters, defaultAuditFilter, toQuery, useAuditLog } =
	await import('../audit/audit-log.js')

type Query = Parameters<typeof toQuery>[0]
type Page = { events: { id: number }[]; nextCursor: number | null }

const EMPTY: Query = {
	from: '',
	to: '',
	category: '',
	event: '',
	outcome: '',
	actor: '',
	idTag: ''
}

/** A `load` whose calls resolve only when the test says so */
function deferredLoad() {
	const pending: ((page: Page) => void)[] = []
	const load = jest.fn(
		(_q: unknown) =>
			new Promise<Page>((resolve) => {
				pending.push(resolve)
			})
	)
	return { load, pending }
}

const page = (ids: number[], nextCursor: number | null = null) =>
	({ events: ids.map((id) => ({ id })), nextCursor }) as Page

describe('toQuery', () => {
	it('defaults to today', () => {
		const q = toQuery(defaultAuditFilter())
		expect(q.from).toBe(dayjs().startOf('day').unix())
		expect(q.to).toBe(dayjs().endOf('day').unix())
	})

	it('maps dates to start/end of day and blanks to undefined', () => {
		const q = toQuery({ ...EMPTY, from: '2026-03-01', to: '2026-03-02', event: ' auth.login ' })
		expect(q.from).toBe(dayjs('2026-03-01').startOf('day').unix())
		expect(q.to).toBe(dayjs('2026-03-02').endOf('day').unix())
		expect(q.to! - q.from!).toBe(2 * 86400 - 1)
		expect(q.event).toBe('auth.login')
		expect(q).toMatchObject({
			category: undefined,
			outcome: undefined,
			actor: undefined,
			idTag: undefined
		})
	})

	it('leaves empty dates undefined', () => {
		const q = toQuery(EMPTY)
		expect(q.from).toBeUndefined()
		expect(q.to).toBeUndefined()
	})
})

describe('useAuditLog', () => {
	it('replaces on the first page and appends on loadMore', async () => {
		const { load, pending } = deferredLoad()
		const query = {}
		const { result } = renderHook(() => useAuditLog(load as never, query))
		await act(async () => pending[0](page([1, 2], 2)))
		expect(result.current.events?.map((e) => e.id)).toEqual([1, 2])

		act(() => {
			result.current.loadMore?.()
		})
		expect(load).toHaveBeenLastCalledWith({ cursor: 2 })
		await act(async () => pending[1](page([3])))
		expect(result.current.events?.map((e) => e.id)).toEqual([1, 2, 3])
		expect(result.current.loadMore).toBeUndefined()
	})

	it('ignores a response that resolves after a newer request', async () => {
		const { load, pending } = deferredLoad()
		const { result, rerender } = renderHook(({ q }) => useAuditLog(load as never, q), {
			initialProps: { q: {} as object }
		})
		// A filter change starts a second first-page request before the first answers
		rerender({ q: { category: 'auth' } })
		expect(pending).toHaveLength(2)
		await act(async () => pending[1](page([20])))
		await act(async () => pending[0](page([10])))
		expect(result.current.events?.map((e) => e.id)).toEqual([20])
	})

	it('clears the old rows and cursor when a new first page fails', async () => {
		const load = jest
			.fn<(q: unknown) => Promise<Page>>()
			.mockResolvedValueOnce(page([1, 2], 2))
			.mockRejectedValueOnce(new Error('boom'))
		const { result, rerender } = renderHook(({ q }) => useAuditLog(load as never, q), {
			initialProps: { q: {} as object }
		})
		await act(async () => {})
		expect(result.current.loadMore).toBeDefined()
		rerender({ q: { category: 'auth' } })
		await act(async () => {})
		expect(result.current.error).toBe('boom')
		expect(result.current.events).toBeUndefined()
		expect(result.current.loadMore).toBeUndefined()
	})

	it('hides "Load more" while a new first page is pending', async () => {
		const { load, pending } = deferredLoad()
		const { result, rerender } = renderHook(({ q }) => useAuditLog(load as never, q), {
			initialProps: { q: {} as object }
		})
		await act(async () => pending[0](page([1, 2], 2)))
		expect(result.current.loadMore).toBeDefined()
		rerender({ q: { category: 'auth' } })
		expect(result.current.loadMore).toBeUndefined()
	})
})

describe('AuditFilters', () => {
	it('rejects a reversed date range without applying it', () => {
		const onApply = jest.fn()
		const { container } = render(<AuditFilters onApply={onApply} />)
		fireEvent.change(container.querySelector('input[name="from"]')!, {
			target: { value: '2026-03-02' }
		})
		fireEvent.change(container.querySelector('input[name="to"]')!, {
			target: { value: '2026-03-01' }
		})
		fireEvent.submit(container.querySelector('form')!)
		expect(screen.getByText('End date must be on or after the start date')).toBeTruthy()
		expect(onApply).not.toHaveBeenCalled()
	})
})

describe('AuditCategorySwitches', () => {
	const switchLabels = () =>
		screen.getAllByRole('switch').map((box) => box.closest('li')?.textContent)

	it('sums up the locked categories and only offers switches for the rest', () => {
		render(<AuditCategorySwitches enabled={[]} locked={['sharing']} onSave={async () => {}} />)
		expect(screen.getByText('Always logged: auth, admin, sharing')).toBeTruthy()
		expect(switchLabels()).toEqual(['access'])
	})

	it('shows only the summary when everything is locked', () => {
		render(
			<AuditCategorySwitches
				enabled={[]}
				locked={['sharing', 'access']}
				onSave={async () => {}}
			/>
		)
		expect(screen.getByText('Always logged: auth, admin, sharing, access')).toBeTruthy()
		expect(screen.queryAllByRole('switch')).toHaveLength(0)
	})

	it('readOnly lists locked and enabled categories without switches', () => {
		render(
			<AuditCategorySwitches
				enabled={['access']}
				locked={[]}
				readOnly
				onSave={async () => {}}
			/>
		)
		expect(screen.getByText('Logged: auth, admin, access')).toBeTruthy()
		expect(screen.queryAllByRole('switch')).toHaveLength(0)
	})

	it('disables the switches while a save is in flight', async () => {
		let finish!: () => void
		const onSave = jest.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve
				})
		)
		render(<AuditCategorySwitches enabled={[]} locked={[]} onSave={onSave} />)
		const switches = () => screen.getAllByRole('switch') as HTMLInputElement[]
		const target = switches().find((box) => !box.disabled)
		if (!target) throw new Error('no toggleable switch')
		fireEvent.click(target)
		expect(onSave).toHaveBeenCalledTimes(1)
		expect(switches().every((box) => box.disabled)).toBe(true)
		await act(async () => finish())
		expect(switches().some((box) => !box.disabled)).toBe(true)
	})

	it('reverts the switch and toasts when the save fails', async () => {
		toast.error.mockClear()
		let fail!: (err: Error) => void
		const onSave = jest.fn(
			() =>
				new Promise<void>((_resolve, reject) => {
					fail = reject
				})
		)
		render(<AuditCategorySwitches enabled={[]} locked={[]} onSave={onSave} />)
		const box = screen.getAllByRole('switch')[0] as HTMLInputElement
		fireEvent.click(box)
		expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(true)
		await act(async () => fail(new Error('offline')))
		expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(false)
		expect(toast.error).toHaveBeenCalledWith('offline')
	})

	it('never sends auth or admin', () => {
		const onSave = jest.fn(async (_next: string[]) => {})
		const el = <AuditCategorySwitches enabled={['sharing']} locked={[]} onSave={onSave} />
		const count = render(el).getAllByRole('switch').length
		// One click per fresh render: a click disables the rest until its save settles
		for (let i = 0; i < count; i++) {
			cleanup()
			const box = render(el).getAllByRole('switch')[i] as HTMLInputElement
			if (!box.disabled) fireEvent.click(box)
		}
		expect(onSave.mock.calls.length).toBeGreaterThan(1)
		for (const [next] of onSave.mock.calls) {
			expect(next).not.toContain('auth')
			expect(next).not.toContain('admin')
		}
	})
})
