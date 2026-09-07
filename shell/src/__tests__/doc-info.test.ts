// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useDocInfo`'s rules, tested through `resolveDocInfo` — the pure half the hook
 * delegates every decision to, since this is a `.test.ts` suite and
 * `shell/jest.config.cjs` runs those under `node`, with no DOM.
 *
 * The property under test: a rename always targets the row served by the ACTIVE
 * context, so the local row wins over the origin and no local row means no
 * rename at all.
 */

import { type ApiClient, FetchError, type FileView } from '@cloudillo/core'
import { jest } from '@jest/globals'

import { fetchRow, type ResolveDocInfoInput, resolveDocInfo } from '../apps/doc-info.js'
import {
	type DocInfoResolver,
	initDocInfoHandlers,
	setDocInfoResolver
} from '../message-bus/handlers/docinfo.js'
import { fileIdFromResId, idTagFromResId } from '../message-bus/handlers/resId.js'

const ME = '@me.example.com'
const COMMUNITY = '@team.example.com'
const OTHER = '@other.example.com'

function row(over: Partial<FileView> = {}): FileView {
	return {
		fileId: 'f1~abc',
		status: 'A',
		contentType: 'cloudillo/quillo',
		fileName: 'Notes',
		createdAt: '2026-01-01T00:00:00Z',
		...over
	}
}

function resolve(over: Partial<ResolveDocInfoInput> = {}) {
	return resolveDocInfo({
		resId: `${ME}:f1~abc`,
		authIdTag: ME,
		contextRoles: [],
		...over
	})
}

describe('resolveDocInfo', () => {
	it('prefers the local row over the origin', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			// Our own pinned copy: we own the local record, the canonical copy is upstream
			localRow: row({
				fileName: 'My copy',
				owner: { idTag: ME },
				upstream: { idTag: OTHER }
			}),
			remoteRow: row({ fileName: 'Their original', owner: { idTag: OTHER } })
		})
		expect(info.fileName).toBe('My copy')
		// A local row is what makes a rename possible at all
		expect(info.canRename).toBe(true)
		expect(info.state).toBe('ready')
		// Provenance too comes off the local row, not the origin's view of itself
		expect(info.isCrossOwner).toBe(true)
	})

	it('falls back to the origin for display only when there is no local row', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			remoteRow: row({ fileName: 'Their original', owner: { idTag: OTHER } })
		})
		expect(info.fileName).toBe('Their original')
		expect(info.state).toBe('ready')
		// Nothing here to rename: the row lives on someone else's node
		expect(info.canRename).toBe(false)
	})

	it('reports an unavailable document when neither row resolved', () => {
		const info = resolve({ resId: `${OTHER}:f1~abc` })
		expect(info.state).toBe('unavailable')
		expect(info.fileName).toBeUndefined()
		expect(info.canRename).toBe(false)
	})

	// With no row there is no `upstream` to read provenance from, and hiding the owner chip on
	// a document we could not fetch is the worse failure — the reader most needs to be told it
	// is not theirs. `canRename` stays gated on a local row, so this cannot widen it.
	it('flags cross-owner when no row resolved and the resId names another node', () => {
		const info = resolve({ resId: `${OTHER}:f1~abc`, contextIdTag: ME })
		expect(info.isCrossOwner).toBe(true)
		expect(info.state).toBe('unavailable')
		expect(info.canRename).toBe(false)
	})

	// The origin's own row carries no `upstream` — it IS the canonical copy, from its own point
	// of view. Read relative to us it is still somebody else's, and the resId says whose.
	it('flags cross-owner for a federated document we have not pinned', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			contextIdTag: ME,
			remoteRow: row({ owner: { idTag: OTHER } })
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.state).toBe('ready')
		expect(info.canRename).toBe(false)
		expect(info.canPost).toBe(false)
	})

	// @cycling.club serving a row @bob.me pinned there: provenance comes off the remote row's
	// own `upstream`, so it survives even when the origin that answered us is not the owner.
	it('follows a remote origin row that is itself a mirror', () => {
		const info = resolve({
			resId: `${COMMUNITY}:f1~abc`,
			contextIdTag: ME,
			remoteRow: row({ owner: { idTag: OTHER }, upstream: { idTag: OTHER } })
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.canPost).toBe(false)
	})

	it('allows renaming our own document', () => {
		const info = resolve({ localRow: row({ owner: { idTag: ME } }) })
		expect(info.isCrossOwner).toBe(false)
		expect(info.canRename).toBe(true)
	})

	it('allows renaming a pinned foreign copy — it is our row, on our node', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			localRow: row({ owner: { idTag: ME }, upstream: { idTag: OTHER } })
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.canRename).toBe(true)
	})

	it('refuses rename and post when the local row merely shares the fileId', () => {
		// `other.tld:f1~abc` asked of OUR node returned OUR own unrelated `f1~abc`.
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			contextIdTag: ME,
			localRow: row({ owner: { idTag: ME } })
		})
		expect(info.canRename).toBe(false)
		expect(info.canPost).toBe(false)
	})

	it('still renames a pinned foreign copy when the context is known', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			contextIdTag: ME,
			localRow: row({ owner: { idTag: ME }, upstream: { idTag: OTHER } })
		})
		expect(info.canRename).toBe(true)
	})

	it('refuses a rename to a visitor with no signed-in identity', () => {
		// A share-link guest reads the row with the file-scoped token minted for the
		// iframe. Cross-owner + a row present used to be enough on its own, which
		// handed an anonymous visitor an editable title that could only ever 403.
		const pinned = row({ owner: { idTag: ME }, upstream: { idTag: OTHER } })
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			authIdTag: undefined,
			localRow: pinned
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.state).toBe('ready')
		expect(info.canRename).toBe(false)
		// …nor a feed to share it to: the Share button would only navigate the guest out of
		// the document the link sent them to.
		expect(info.canPost).toBe(false)
		// …and the same row with a session behind it is still the renameable
		// pinned-copy case the cross-owner branch exists for. Posting it is not:
		// `canPost` needs a row that originates HERE, and the node sent no access
		// level for this mirror anyway.
		const signedIn = resolve({ resId: `${OTHER}:f1~abc`, authIdTag: ME, localRow: pinned })
		expect(signedIn.canRename).toBe(true)
		expect(signedIn.canPost).toBe(false)
	})

	it('offers no feed post on a read-only mirror, which rename still reaches', () => {
		// An FSHR read-only share: our record, upstream content, no write access.
		const mirror = row({
			owner: { idTag: ME },
			upstream: { idTag: OTHER },
			accessLevel: 'read'
		})
		const info = resolve({ resId: `${OTHER}:f1~abc`, localRow: mirror })
		expect(info.isCrossOwner).toBe(true)
		expect(info.canRename).toBe(true)
		expect(info.canPost).toBe(false)
	})

	it('offers no feed post on a document the viewer only reads', () => {
		// A read-only grantee's own local row: signed in, but no authority over it.
		// Sharing it would publish a link most of the audience cannot open, and the
		// composer's access notice only fires for documents the author owns.
		const readOnly = row({ owner: { idTag: OTHER }, accessLevel: 'read' })
		const info = resolve({ resId: `${OTHER}:f1~abc`, localRow: readOnly })
		expect(info.canRename).toBe(false)
		expect(info.canPost).toBe(false)
	})

	it('refuses a community document to a plain member, and allows it to a moderator', () => {
		// `owner` is the community itself here; a member-owned row behaves the same way, since
		// authority now comes from the role ladder rather than from an owner/tenant comparison.
		const communityRow = row({ owner: { idTag: COMMUNITY } })
		expect(resolve({ resId: `${COMMUNITY}:f1~abc`, localRow: communityRow }).canRename).toBe(
			false
		)
		expect(
			resolve({
				resId: `${COMMUNITY}:f1~abc`,
				contextRoles: ['moderator'],
				localRow: communityRow
			}).canRename
		).toBe(true)
	})

	// The chip asks "whose document is this?", not "where does the canonical copy live?".
	it('flags cross-owner whenever the content owner is not the viewer', () => {
		expect(resolve({ localRow: row({ owner: { idTag: ME } }) }).isCrossOwner).toBe(false)
		// Entirely local, no upstream — and still not ours
		expect(resolve({ localRow: row({ owner: { idTag: OTHER } }) }).isCrossOwner).toBe(true)
	})

	// Symptom 1: an accepted share leaves `files.owner_tag` NULL, which the API resolves to the
	// serving tenant — us. Reading `owner` straight would put OUR face on THEIR document.
	it('attributes a mirrored row to its origin, not to the local record holder', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			localRow: row({ owner: { idTag: ME }, upstream: { idTag: OTHER, name: 'Other' } })
		})
		expect(info.owner?.idTag).toBe(OTHER)
		expect(info.owner?.name).toBe('Other')
		expect(info.isCrossOwner).toBe(true)
	})

	// Symptom 2: a community's own document carries no upstream — it is served by the context it
	// belongs to — and the old provenance test hid the chip on it.
	it('shows the chip for a community document in its own context', () => {
		const info = resolve({
			resId: `${COMMUNITY}:f1~abc`,
			contextIdTag: COMMUNITY,
			localRow: row({ owner: { idTag: COMMUNITY } })
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.owner?.idTag).toBe(COMMUNITY)
	})

	// Nothing to compare against, so the reader is always told whose document this is.
	it('shows the chip to a visitor with no signed-in identity', () => {
		expect(
			resolve({ authIdTag: undefined, localRow: row({ owner: { idTag: ME } }) }).isCrossOwner
		).toBe(true)
	})

	// The reason `isMirrored` stayed split off: a peer's document in a community we hold no role
	// on shows the chip, and must not become renameable on the strength of that.
	it('keeps rename authority on provenance, not on the chip', () => {
		const info = resolve({
			resId: `${COMMUNITY}:f1~abc`,
			contextIdTag: COMMUNITY,
			contextRoles: [],
			localRow: row({ owner: { idTag: OTHER } })
		})
		expect(info.isCrossOwner).toBe(true)
		expect(info.canRename).toBe(false)
	})

	it('carries the owner chip fields through, narrowing the profile type', () => {
		const info = resolve({
			resId: `${OTHER}:f1~abc`,
			localRow: row({
				owner: { idTag: OTHER, name: 'Other', profilePic: 'p1~pic', type: 'community' }
			})
		})
		expect(info.owner).toEqual({
			idTag: OTHER,
			name: 'Other',
			profilePic: 'p1~pic',
			type: 'community'
		})
		// An unrecognised type is dropped rather than passed through
		const odd = resolve({ localRow: row({ owner: { idTag: ME, type: 'robot' } }) })
		expect(odd.owner?.type).toBeUndefined()
	})
})

/**
 * "There is no such row" versus "nobody answered". Only the first may become
 * `state: 'unavailable'` — the second has to stay on the loading skeleton, or a
 * share-link guest (whose token has not arrived yet) and a shell still resolving
 * `auth` both flash "Document unavailable" at a document that is perfectly fine.
 */
describe('fetchRow', () => {
	function failing(httpStatus: number): ApiClient {
		return {
			files: {
				list: async () => {
					throw new FetchError('ERROR', 'nope', httpStatus)
				}
			}
		} as unknown as ApiClient
	}

	it('reports a missing client as a failure, not as an absent row', async () => {
		expect(await fetchRow(null, 'f1~abc')).toEqual({ failed: true })
	})

	it('reports a refusal as a failure the origin may still answer', async () => {
		expect(await fetchRow(failing(403), 'f1~abc')).toEqual({ failed: true, denied: true })
	})

	it('takes a 404 as a genuine answer', async () => {
		expect(await fetchRow(failing(404), 'f1~abc')).toEqual({})
	})

	it('reports anything else as a plain failure', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		expect(await fetchRow(failing(500), 'f1~abc')).toEqual({ failed: true })
		warn.mockRestore()
	})

	it('returns the row when the node has one', async () => {
		const client = { files: { list: async () => [row()] } } as unknown as ApiClient
		expect(await fetchRow(client, 'f1~abc')).toEqual({ row: row() })
	})
})

describe('resId splitting', () => {
	it('splits on the first colon only, so a fileId may contain colons', () => {
		const resId = `${ME}:f1~abc:extra:bits`
		expect(idTagFromResId(resId)).toBe(ME)
		expect(fileIdFromResId(resId)).toBe('f1~abc:extra:bits')
		expect(resolve({ resId, localRow: row() }).fileId).toBe('f1~abc:extra:bits')
	})

	it('treats a bare fileId as having no owner', () => {
		expect(idTagFromResId('f1~abc')).toBeUndefined()
		expect(fileIdFromResId('f1~abc')).toBeUndefined()
		expect(resolve({ resId: 'f1~abc', localRow: row() }).fileId).toBe('f1~abc')
	})
})

/**
 * `doc:rename.req` reaching the shell through the embed relay.
 *
 * `setupEmbedRelay` reposts from the HOST app's window, so `validateSource`
 * resolves the HOST's connection and the rename would target the document the
 * embed is embedded IN. The relay's own allowlist already refuses to forward
 * this type; this is the second lock, and the one that survives someone widening
 * that allowlist later.
 */
describe('doc:rename.req from embedded content', () => {
	interface Response {
		type: string
		ok: boolean
		data?: Record<string, unknown>
		error?: string
	}

	function createBus(resolver: DocInfoResolver) {
		const responses: Response[] = []
		let handler: ((msg: unknown, source: unknown) => Promise<void>) | undefined

		const bus = {
			on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
				if (type === 'doc:rename.req') handler = fn
			},
			getAppTracker: () => ({
				validateSource: () => ({ resId: `${ME}:f1~abc`, initialized: true })
			}),
			sendResponse: (
				_win: unknown,
				type: string,
				_id: unknown,
				ok: boolean,
				data?: Record<string, unknown>,
				error?: string
			) => {
				responses.push({ type, ok, data, error })
			}
		}

		// biome-ignore lint/suspicious/noExplicitAny: the stub is a deliberate subset
		initDocInfoHandlers(bus as any)
		setDocInfoResolver(resolver)

		return {
			responses,
			async rename(fileName: string, relayed?: boolean) {
				await handler?.({ id: 1, relayed, payload: { fileName } }, {} as Window)
			}
		}
	}

	function trackingResolver() {
		const renamed: Array<[string, string]> = []
		const resolver: DocInfoResolver = {
			async getInfo() {
				return undefined
			},
			async rename(resId, fileName) {
				renamed.push([resId, fileName])
				return { ok: true, fileName }
			}
		}
		return { renamed, resolver }
	}

	afterEach(() => {
		setDocInfoResolver(null)
	})

	it('refuses a relayed rename without touching the host document', async () => {
		const { renamed, resolver } = trackingResolver()
		const bus = createBus(resolver)

		await bus.rename('Owned by the embed', true)

		expect(renamed).toEqual([])
		expect(bus.responses[0]).toMatchObject({
			type: 'doc:rename.res',
			ok: false,
			error: 'Rename is not available to embedded content'
		})
	})

	it('still renames for the app that owns the connection', async () => {
		const { renamed, resolver } = trackingResolver()
		const bus = createBus(resolver)

		await bus.rename('Renamed')

		expect(renamed).toEqual([[`${ME}:f1~abc`, 'Renamed']])
		expect(bus.responses[0]).toMatchObject({ type: 'doc:rename.res', ok: true })
	})
})

// vim: ts=4
