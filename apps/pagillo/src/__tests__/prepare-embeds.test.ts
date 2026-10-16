// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** `prepareEmbeds`: render cache, failures and cancel, with `renderEmbeds` mocked. */

import { jest } from '@jest/globals'

type Out = { ok: true; pages: string[] } | { ok: false; error: string }
const renderEmbeds = jest.fn(
	async (reqs: unknown[], _o: unknown): Promise<Out[]> =>
		reqs.map(() => ({ ok: true, pages: ['<svg/>'] }))
)

const core = await import('@cloudillo/core')
jest.unstable_mockModule('@cloudillo/core', () => ({
	...core,
	getAppBus: () => ({}),
	renderEmbeds
}))

const { jobKey, prepareEmbeds } = await import('../export/prepare-embeds.js')
type Job = Parameters<typeof jobKey>[0]

const job = (n: number): Job =>
	({
		frameId: `e${n}`,
		page: 'p1',
		w: 1000,
		h: 1000,
		rec: { address: core.docRef('calcillo', `a.b:f${n}`), lastTitle: `T${n}` }
	}) as Job

const opts = (o: Partial<Parameters<typeof prepareEmbeds>[1]> = {}) => ({
	sourceFileId: 'src',
	renders: new Map<string, { svg: string }>(),
	signal: new AbortController().signal,
	t: (s: string) => s,
	...o
})

describe('prepareEmbeds', () => {
	beforeEach(() => renderEmbeds.mockClear())

	it('does not re-render a cached job', async () => {
		const renders = new Map([[jobKey(job(1)), { svg: '<svg id="c"/>' }]])
		const r = await prepareEmbeds([job(1)], opts({ renders }))
		expect(renderEmbeds).not.toHaveBeenCalled()
		expect(r?.embeds.e1.svg).toBe('<svg id="c"/>')
	})

	it('fails every job without a source file id', async () => {
		const r = await prepareEmbeds([job(1), job(2)], opts({ sourceFileId: undefined }))
		expect(renderEmbeds).not.toHaveBeenCalled()
		expect(r?.failed.map((f) => f.frameId)).toEqual(['e1', 'e2'])
	})

	it('reports one failure and keeps the ok render', async () => {
		renderEmbeds.mockImplementationOnce(async () => [
			{ ok: true, pages: ['<svg/>'] },
			{ ok: false, error: 'boom' }
		])
		const r = await prepareEmbeds([job(1), job(2)], opts())
		expect(r?.failed).toEqual([{ frameId: 'e2', page: 'p1', title: 'T2', error: 'boom' }])
		expect(r?.embeds.e1.svg).toBe('<svg/>')
		expect(r?.embeds.e2.svg).toBeUndefined()
	})

	it('returns undefined when aborted', async () => {
		const ac = new AbortController()
		ac.abort()
		expect(await prepareEmbeds([job(1)], opts({ signal: ac.signal }))).toBeUndefined()
	})
})

// vim: ts=4
