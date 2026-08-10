// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'

import { deletePage } from '../rtdb/page-ops.js'
import type { PageRecord } from '../rtdb/types.js'

type PageWithId = PageRecord & { id: string }

/** Mirrors the constant in page-ops.ts, which is deliberately not exported. */
const DELETE_BATCH_SIZE = 200

function page(id: string, title: string, parentPageId?: string): PageWithId {
	return {
		id,
		title,
		...(parentPageId !== undefined && { parentPageId }),
		order: 0,
		createdAt: '',
		updatedAt: '',
		createdBy: 'u'
	}
}

//     home (root)
//       └ a
//         └ b
const pages = new Map<string, PageWithId>(
	[page('home', 'Home', '__root__'), page('a', 'A', 'home'), page('b', 'B', 'a')].map((p) => [
		p.id,
		p
	])
)

/** A block as the fake serves it. `owner` overrides its stored `p` field. */
type FakeBlock = string | { id: string; owner: string }

interface Fake {
	client: RtdbClient
	/** One entry per `batch().commit()`, holding the ref paths it deleted. */
	commits: string[][]
	/** Page ids the block lookup asked for, in the order it asked. */
	queried: string[]
}

function fakeClient(
	blocksByPage: Record<string, FakeBlock[]>,
	onCommit?: (commits: string[][]) => void
): Fake {
	const commits: string[][] = []
	const queried: string[] = []

	const client = {
		collection(_name: string) {
			return {
				where(_field: string, _op: string, pageId: string) {
					return {
						get: async () => {
							queried.push(pageId)
							const docs = (blocksByPage[pageId] ?? []).map((block) => {
								const id = typeof block === 'string' ? block : block.id
								const owner = typeof block === 'string' ? pageId : block.owner
								return { id, data: () => ({ p: owner }) }
							})
							return {
								docs,
								size: docs.length,
								empty: docs.length === 0,
								forEach(cb: (doc: (typeof docs)[number]) => void) {
									for (const doc of docs) cb(doc)
								},
								docChanges: () => []
							}
						}
					}
				}
			}
		},
		ref: (path: string) => path,
		batch() {
			const paths: string[] = []
			return {
				delete(ref: string) {
					paths.push(ref)
				},
				commit: async () => {
					commits.push(paths)
					onCommit?.(commits)
				}
			}
		}
	}

	return { client: client as unknown as RtdbClient, commits, queried }
}

describe('deletePage', () => {
	// The ordering is the crash-safety guarantee: deepest page first, and each
	// page's blocks immediately before the page document itself. An interrupted run
	// then leaves every page it has not reached fully intact, so re-running the
	// delete finishes the job rather than leaving hollow pages standing.
	it('commits each page’s blocks before the page, deepest page first', async () => {
		const { client, commits, queried } = fakeClient({ home: ['h1', 'h2'], a: ['a1'], b: [] })
		await deletePage(client, 'home', pages)
		expect(commits.flat()).toEqual(['p/b', 'b/a1', 'p/a', 'b/h1', 'b/h2', 'p/home'])
		// One indexed `p == id` lookup per page, in the same order — never a
		// chunked `in` scan over the whole block collection.
		expect(queried).toEqual(['b', 'a', 'home'])
	})

	it('deletes only the subtree when asked for a branch', async () => {
		const { client, commits } = fakeClient({ home: ['h1'], a: ['a1'], b: ['b1'] })
		await deletePage(client, 'a', pages)
		expect(commits.flat()).toEqual(['b/b1', 'p/b', 'b/a1', 'p/a'])
	})

	// A backend that dropped the filter would hand back the whole collection, and
	// without this check a subtree delete would take every block in the document.
	it('ignores a returned block that is filed under another page', async () => {
		const { client, commits } = fakeClient({
			b: ['b1', { id: 'stray', owner: 'elsewhere' }]
		})
		await deletePage(client, 'b', pages)
		expect(commits.flat()).toEqual(['b/b1', 'p/b'])
	})

	it('keeps every batch within the commit size limit', async () => {
		const blocks = Array.from({ length: 450 }, (_, i) => `blk${i}`)
		const { client, commits } = fakeClient({ b: blocks })
		await deletePage(client, 'b', pages)
		expect(commits.flat()).toHaveLength(451) // 450 blocks + the page itself
		for (const commit of commits) expect(commit.length).toBeLessThanOrEqual(DELETE_BATCH_SIZE)
	})

	it('reports progress once per page, counting up to the total', async () => {
		const { client } = fakeClient({ home: ['h1'], a: [], b: [] })
		const progress: Array<[number, number]> = []
		await deletePage(client, 'home', pages, {
			onProgress: (done, total) => progress.push([done, total])
		})
		expect(progress).toEqual([
			[1, 3],
			[2, 3],
			[3, 3]
		])
	})

	it('takes the caller’s child index instead of rebuilding one', async () => {
		const { client, commits } = fakeClient({ home: [], a: [], b: [] })
		await deletePage(client, 'home', pages, {
			childIndex: new Map([
				['home', ['a']],
				['a', ['b']]
			])
		})
		expect(commits.flat()).toEqual(['p/b', 'p/a', 'p/home'])
	})

	// Aborting stops the cascade where it stands; what it already committed stays
	// committed. That is the invariant the deepest-first ordering makes safe.
	it('stops committing once the signal aborts, keeping what it committed', async () => {
		const controller = new AbortController()
		const { client, commits } = fakeClient({ home: ['h1'], a: ['a1'], b: ['b1'] }, () =>
			controller.abort()
		)
		await expect(
			deletePage(client, 'home', pages, { signal: controller.signal })
		).rejects.toThrow()
		expect(commits.flat()).toEqual(['b/b1', 'p/b'])
	})
})

// vim: ts=4
