// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useFileOwnerScope`'s rules, tested through `deriveFileOwnerScope` - the pure half the hook
 * delegates every decision to, since this is a `.test.ts` suite and `shell/jest.config.cjs` runs
 * those under `node`, with no DOM. The property under test is the cross-tenant role leak: a
 * MIRRORED row's standing must never come from the active context.
 *
 * Provenance is `upstream` alone. `owner` is authority and is back-filled to the serving tenant, so
 * a community member's own file has `owner ≠ context` and is nonetheless entirely local.
 */

import type { FileOwnerScopeInput } from '../apps/files/utils.js'
import {
	deriveFileOwnerScope,
	fileSrcIdTag,
	isCrossOwnerFile,
	isOwnerSettled
} from '../apps/files/utils.js'

const ME = '@me.example.com'
const HOME = '@me.example.com'
const COMMUNITY = '@team.example.com'
const MEMBER = '@carol.example.com'
const OTHER = '@other.example.com'

function derive(over: Partial<FileOwnerScopeInput> = {}) {
	return deriveFileOwnerScope({
		file: {},
		authIdTag: ME,
		contextIdTag: HOME,
		ownerStatus: 'idle',
		ownerRoles: [],
		contextRoles: [],
		...over
	})
}

/** Nothing at all may be granted. Asserted as one object so a failure names every flag. */
function expectGrantsNothing(scope: ReturnType<typeof derive>) {
	expect({
		canManageShares: scope.canManageShares,
		canReadShares: scope.canReadShares,
		canManageFile: scope.canManageFile
	}).toEqual({ canManageShares: false, canReadShares: false, canManageFile: false })
}

// 'idle' must never read as settled: it is what the FIRST render of a mirrored file sees, and
// counting it as an answer made ShareDialog paint "Could not reach the server that holds this
// file." for one frame, against a null api.
describe('isOwnerSettled', () => {
	it('treats a lookup that has not started or not finished as unsettled', () => {
		expect(isOwnerSettled('idle')).toBe(false)
		expect(isOwnerSettled('loading')).toBe(false)
	})

	it('treats both outcomes as settled', () => {
		expect(isOwnerSettled('ready')).toBe(true)
		// 'failed' is an ANSWER - it is what makes the error message legitimate
		expect(isOwnerSettled('failed')).toBe(true)
	})
})

describe('deriveFileOwnerScope: locally originating rows', () => {
	it('is not cross-owner and judges against the active context', () => {
		const scope = derive({
			file: { owner: { idTag: COMMUNITY } },
			contextIdTag: COMMUNITY,
			contextRoles: ['leader']
		})
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.scopeIdTag).toBe(COMMUNITY)
		expect(scope.scopeRoles).toEqual(['leader'])
		expect(scope.resolving).toBe(false)
		expect(scope.canManageShares).toBe(true)
	})

	/*
	 * THE regression the whole ownership rename exists to prevent. After the swap a community
	 * member's own file carries `owner = member ≠ context` while remaining entirely local. Reading
	 * that as cross-context would strip its accessLevel, fire a proxy-token probe at the member's
	 * node and build an app resId with the wrong owner half.
	 */
	it('treats a MEMBER-owned community row as local, firing no upstream lookup', () => {
		const scope = derive({
			file: { owner: { idTag: MEMBER }, accessLevel: 'write' },
			contextIdTag: COMMUNITY,
			contextRoles: ['moderator']
		})
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.upstreamIdTag).toBeUndefined()
		expect(scope.scopeIdTag).toBe(COMMUNITY)
		// Not stripped: the serving node computed it
		expect(scope.scopedFile.accessLevel).toBe('write')
		expect(scope.resolving).toBe(false)
		expect(scope.canManageFile).toBe(true)
	})

	// ...and the deliberate widening that came with it: leadership now reaches a member's own row.
	it('lets a community leader manage shares on a member-owned row', () => {
		const scope = derive({
			file: { owner: { idTag: MEMBER } },
			contextIdTag: COMMUNITY,
			contextRoles: ['leader']
		})
		expect(scope.canManageShares).toBe(true)
		expect(scope.grantCeiling).toBe('admin')
	})

	/*
	 * A community row confers nothing on a plain member. The old code short-circuited canManageFile
	 * to `true` on an "ownerless" row, handing every member the Rename button, the Visibility
	 * dropdown and editable Tags - all three 403.
	 */
	it('refuses a community row to a plain member', () => {
		const scope = derive({
			file: { owner: { idTag: COMMUNITY } },
			contextIdTag: COMMUNITY,
			contextRoles: []
		})
		expect(scope.canManageFile).toBe(false)
		expect(scope.canManageShares).toBe(false)
	})

	it('grants the same row to a moderator of that community', () => {
		const scope = derive({
			file: { owner: { idTag: COMMUNITY } },
			contextIdTag: COMMUNITY,
			contextRoles: ['moderator']
		})
		expect(scope.canManageFile).toBe(true)
	})

	it('leaves our own row on our OWN node alone', () => {
		const scope = derive({ file: { owner: { idTag: ME } }, contextIdTag: HOME })
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.canManageFile).toBe(true)
	})
})

describe('deriveFileOwnerScope: mirrored rows', () => {
	const mirrored = {
		file: { owner: { idTag: ME }, upstream: { idTag: OTHER } },
		contextIdTag: COMMUNITY
	}

	it('grants no upstream standing while the lookup is in flight', () => {
		const scope = derive({ ...mirrored, ownerStatus: 'loading', contextRoles: ['leader'] })
		expect(scope.isCrossOwner).toBe(true)
		expect(scope.resolving).toBe(true)
		expect(scope.canManageShares).toBe(false)
		// Record authority, which the lookup never decides: this row's owner is ME, and the
		// placer of a Pin row may see (and rename/move/delete) their own copy whatever the
		// upstream node ends up saying about its contents. `canManageFile` says the same in
		// this state; consumers that must not act early gate on `resolving`/`scopeReady`
		// instead (DetailsPanel's `canSeeShares`).
		expect(scope.canReadShares).toBe(true)
		expect(scope.canManageFile).toBe(true)
	})

	it('grants a mirrored row nothing to a non-owner while the lookup is in flight', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			ownerStatus: 'loading',
			contextRoles: ['leader']
		})
		expect(scope.canManageShares).toBe(false)
		expect(scope.canReadShares).toBe(false)
		expect(scope.canManageFile).toBe(false)
	})

	it('counts the first render, before the effect has run, as still resolving', () => {
		// 'idle' is what the state initialiser leaves behind on that render
		expect(derive({ ...mirrored, ownerStatus: 'idle' }).resolving).toBe(true)
	})

	/**
	 * THE regression this file exists for. A refused proxy token must not fall back to the active
	 * context: `scopeIdTag` stays the UPSTREAM node and every permission stays false. Falling back
	 * to contextIdTag/contextRoles on 'failed' would hand a leader of COMMUNITY full share rights
	 * over a file whose canonical copy lives on OTHER - the leak in its original form.
	 */
	it('points at the upstream node and grants nothing when the lookup is refused', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			ownerStatus: 'failed',
			contextRoles: ['leader']
		})
		expect(scope.resolving).toBe(false)
		expect(scope.scopeIdTag).toBe(OTHER)
		expect(scope.scopeIdTag).not.toBe(COMMUNITY)
		expect(scope.scopeRoles).toEqual([])
		expectGrantsNothing(scope)
	})

	it('ignores roles held on the ACTIVE context once the upstream node has answered', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			ownerStatus: 'ready',
			// leader of COMMUNITY, nothing at all on OTHER
			contextRoles: ['leader'],
			ownerRoles: []
		})
		expect(scope.scopeRoles).toEqual([])
		expect(scope.canManageShares).toBe(false)
		expect(scope.canManageFile).toBe(false)
	})

	/*
	 * Roles held on the UPSTREAM node do NOT confer share management on a row that is mirrored
	 * HERE: `leader_over_local_row` is gated on `upstream.is_none()`, and this row's scoped copy
	 * still carries its upstream tag. Only an explicit grant reaches across.
	 */
	it('does not let upstream leadership manage a mirrored row`s shares', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			ownerStatus: 'ready',
			ownerRoles: ['leader']
		})
		expect(scope.canManageShares).toBe(false)
	})

	/*
	 * The record-vs-content split: the placer of a Pin row owns the local RECORD, so rename / move
	 * / hide / delete / tag stay available (the ABAC ownership branch is not upstream-gated) while
	 * the share set belongs to the node holding the canonical copy.
	 */
	it('still reports canManageFile for our OWN mirrored row while resolving', () => {
		const scope = derive({ ...mirrored, ownerStatus: 'loading' })
		expect(scope.resolving).toBe(true)
		expect(scope.canManageFile).toBe(true)
		expect(scope.canManageShares).toBe(false)
	})

	it('grants nothing while the active context is unknown', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: undefined
		})
		expect(scope.scopeUnresolved).toBe(true)
		expect(scope.resolving).toBe(true)
		expectGrantsNothing(scope)
	})

	/**
	 * A mirrored row's `accessLevel` came from the ACTIVE context's list response, while
	 * `scopeIdTag`/`scopeRoles` describe the UPSTREAM node. canReadShares reads that level, so
	 * leaving it on let a community's cached 'write' vouch for standing on another tenant - the
	 * same leak in a different currency. The derivation strips it.
	 */
	it('does not let the active context`s access level vouch for the upstream node', () => {
		const withAccess = {
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER }, accessLevel: 'write' },
			contextIdTag: COMMUNITY
		} satisfies Partial<FileOwnerScopeInput>
		expectGrantsNothing(derive({ ...withAccess, ownerStatus: 'loading' }))
		const ready = derive({ ...withAccess, ownerStatus: 'ready', ownerRoles: [] })
		expect(ready.scopedFile.accessLevel).toBeUndefined()
		expect(ready.canReadShares).toBe(false)
	})

	/*
	 * The same leak in the strongest currency there is: `canManageShares` returns true on
	 * `accessLevel === 'admin'` alone, so a cached 'admin' from the ACTIVE context would hand out
	 * share management on ANOTHER tenant's row if the strip did not run first. Which is what makes
	 * ShareDialog's `hasAdminGrant` fallback the only legitimate route on mirrored rows.
	 */
	it('strips a cached `admin` level too, so it cannot confer share management elsewhere', () => {
		const ready = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER }, accessLevel: 'admin' },
			contextIdTag: COMMUNITY,
			ownerStatus: 'ready',
			ownerRoles: []
		})
		expect(ready.scopedFile.accessLevel).toBeUndefined()
		expectGrantsNothing(ready)
	})

	// ...and on a LOCAL row nothing is stripped, so the grant does its job.
	it('keeps `admin` on a local row, where it is the serving node`s own answer', () => {
		const scope = derive({
			file: { owner: { idTag: COMMUNITY }, accessLevel: 'admin' },
			contextIdTag: COMMUNITY,
			ownerStatus: 'ready'
		})
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.scopedFile.accessLevel).toBe('admin')
		expect(scope.canManageShares).toBe(true)
		expect(scope.canReadShares).toBe(true)
	})
})

/*
 * `grantCeiling` rides along on the derivation rather than being recomputed at the callers, so
 * ShareDialog's level menus and the backend's `ensure_grant_within` are judged off exactly the same
 * `scopedFile` the permission flags are.
 */
describe('deriveFileOwnerScope: grantCeiling', () => {
	it('is admin for the owner and for a leader over a locally originating row', () => {
		expect(derive({ file: { owner: { idTag: ME } } }).grantCeiling).toBe('admin')
		expect(
			derive({
				file: { owner: { idTag: COMMUNITY } },
				contextIdTag: COMMUNITY,
				contextRoles: ['leader']
			}).grantCeiling
		).toBe('admin')
	})

	// The ceiling is what stops a low-level share manager minting more access than they hold.
	it('caps a Read-level caller at read', () => {
		const scope = derive({
			file: { owner: { idTag: MEMBER }, accessLevel: 'read' },
			contextIdTag: COMMUNITY
		})
		expect(scope.canManageShares).toBe(false)
		expect(scope.grantCeiling).toBe('read')
	})

	/*
	 * A mirrored row has had `accessLevel` stripped, so nothing here knows the real ceiling.
	 * Guessing low would grey out the menu for a legitimate manager - `getMetadata` is what refines
	 * it in ShareDialog, and the server is the enforcer either way.
	 */
	it('is unrestricted on a mirrored row, where the level has been stripped', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER }, accessLevel: 'read' },
			contextIdTag: COMMUNITY,
			ownerStatus: 'ready',
			ownerRoles: []
		})
		expect(scope.scopedFile.accessLevel).toBeUndefined()
		// Not from any standing - the row confers none here - but from the `?? 'admin'` fallback
		expect(scope.canManageShares).toBe(false)
		expect(scope.grantCeiling).toBe('admin')
	})
})

describe('deriveFileOwnerScope: override precedence', () => {
	const override = { idTag: OTHER, roles: ['leader'] }

	it('takes precedence over the cross-owner path entirely', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			// Would be an upstream lookup without the override, and would grant nothing
			ownerStatus: 'loading',
			contextRoles: [],
			override
		})
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.resolving).toBe(false)
		expect(scope.scopeIdTag).toBe(OTHER)
		expect(scope.scopeRoles).toEqual(['leader'])
	})

	it('uses the override roles, not the active context roles', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			contextRoles: ['leader'],
			override: { idTag: OTHER, roles: [] }
		})
		expect(scope.scopeRoles).toEqual([])
		expect(scope.canManageShares).toBe(false)
	})

	// The override IS what names the node while remote-browsing; its roles are the ones the proxy
	// token reported there, so a row served by that node is judged on them alone.
	it('judges a browsed node`s own row on the roles held there', () => {
		expect(
			derive({
				file: { owner: { idTag: OTHER } },
				contextIdTag: HOME,
				override: { idTag: OTHER, roles: [] }
			}).canManageFile
		).toBe(false)
		expect(
			derive({
				file: { owner: { idTag: OTHER } },
				contextIdTag: HOME,
				override: { idTag: OTHER, roles: ['moderator'] }
			}).canManageFile
		).toBe(true)
	})

	// An override that names no tenant decides nothing: there is no node to judge against, so
	// nothing may be granted and `api` stays null.
	it('treats an override with no tenant as unresolved', () => {
		const scope = derive({
			file: {},
			contextIdTag: HOME,
			override: { idTag: undefined, roles: ['leader'] }
		})
		expect(scope.scopeUnresolved).toBe(true)
		expect(scope.resolving).toBe(true)
		expectGrantsNothing(scope)
	})

	// The override's own waiting state: the node is decided, its client is not here yet. Callers keep
	// the override present meanwhile so the row is not re-judged against the local context.
	it('is still resolving when the override says so', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			override: { idTag: OTHER, roles: ['leader'], resolving: true }
		})
		expect(scope.scopeUnresolved).toBe(false)
		expect(scope.scopeIdTag).toBe(OTHER)
		expect(scope.resolving).toBe(true)
	})
})

/*
 * Which node an <img> for a profile picture is addressed to. It tracks `scopeIdTag` because the
 * tenant that served the file row also mirrors the `vis.pf` blobs of its owner and share
 * recipients; the VIEWER's node - the component default - need not. DetailsPanel and ShareDialog
 * both render rows for the same file, so a second spelling of this at either call site is how the
 * two came to build different URLs for the same avatar.
 */
describe('deriveFileOwnerScope: profileSrcTag', () => {
	it('names the active context for a locally originating file', () => {
		const scope = derive({ file: { owner: { idTag: MEMBER } }, contextIdTag: COMMUNITY })
		expect(scope.profileSrcTag).toBe(COMMUNITY)
	})

	it('follows scopeIdTag to the upstream node for a mirrored file', () => {
		const scope = derive({
			file: { owner: { idTag: ME }, upstream: { idTag: OTHER } },
			contextIdTag: COMMUNITY
		})
		expect(scope.profileSrcTag).toBe(OTHER)
		expect(scope.profileSrcTag).toBe(scope.scopeIdTag)
	})

	it('names the node an override decided on', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			override: { idTag: OTHER, roles: [] }
		})
		expect(scope.profileSrcTag).toBe(OTHER)
	})

	// Last resort, and still just an image host hint: with no context and no override there is
	// nothing else to ask.
	it('falls through to our own node when nothing else names one', () => {
		const scope = derive({ file: {}, contextIdTag: undefined })
		expect(scope.profileSrcTag).toBe(ME)
	})
})

// The single flag both the derivation and useFileOwnerScope's effect branch on: computing it
// separately would let a change to one reading silently split the affordance from the node.
describe('isCrossOwnerFile', () => {
	it('is true exactly when a row names an upstream node and nothing overrides it', () => {
		expect(isCrossOwnerFile(OTHER, false)).toBe(true)
		expect(isCrossOwnerFile(undefined, false)).toBe(false)
	})

	it('is false whenever an override names the node', () => {
		// The override IS the answer - no upstream lookup happens at all
		expect(isCrossOwnerFile(OTHER, true)).toBe(false)
		expect(isCrossOwnerFile(undefined, true)).toBe(false)
	})
})

describe('fileSrcIdTag', () => {
	it('addresses the upstream node for a mirrored row', () => {
		// Even while remote-browsing: a row `remoteOwner` themselves pinned from a third node
		// still lives on that third node.
		expect(
			fileSrcIdTag(
				{ upstream: { idTag: OTHER } },
				{ remoteOwner: COMMUNITY, contextIdTag: ME }
			)
		).toBe(OTHER)
	})

	it('addresses the browsed node for a row that originates there', () => {
		// The rows of a remote listing carry no `upstream`, and `contextIdTag` is still ours
		expect(fileSrcIdTag({}, { remoteOwner: COMMUNITY, contextIdTag: ME })).toBe(COMMUNITY)
	})

	it('addresses the active context for an ordinary row', () => {
		expect(fileSrcIdTag({}, { remoteOwner: undefined, contextIdTag: ME })).toBe(ME)
	})
})

/**
 * What stays out of reach here, because it lives in effects and in a hook return rather than in a
 * pure derivation. Covering it needs a `.test.tsx` suite — the jsdom project — rendering the hooks,
 * the way `file-selection.test.tsx` uses `renderHook`:
 *
 *   - `useFileOwnerScope`'s `acquireOwnerApi` — the `setOwnerState({ status: 'loading', ... })`
 *     INSIDE the cross-owner branch. `isCrossOwner` stays true when `upstreamIdTag` changes from
 *     one foreign tenant to another, so that write must happen before any await or the previous
 *     node's client and roles survive into the new one's render.
 *   - the hook's three-way choice of `api` (override → upstream client → active context), which the
 *     derivation cannot own because it holds no ApiClient. It branches on `scopeUnresolved` and
 *     `isCrossOwner`, both covered above.
 *   - `useFileNavigation`'s `acquireRemoteApi` — `setRemoteApi(null)` / `setRemoteRoles([])`.
 *     FilesApp pairs those with the NEW node's idTag in `remoteScope`, so a late reset hands
 *     DetailsPanel and ShareDialog a client and a standing belonging to different tenants.
 */
describe('uncovered: the owner-state loading reset and the api branch', () => {
	it.todo('resets client and roles before awaiting a new upstream node — see the note above')
})

// vim: ts=4
