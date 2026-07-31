// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useFileOwnerScope`'s rules, tested through `deriveFileOwnerScope` - the pure half the hook
 * delegates every decision to, since `shell` has no `@testing-library/react`. The property under
 * test is the cross-tenant role leak: a foreign-owned row's standing must never come from the
 * active context.
 */

import type { FileOwnerScopeInput } from '../apps/files/utils.js'
import { deriveFileOwnerScope, isCrossOwnerFile, isOwnerSettled } from '../apps/files/utils.js'

const ME = '@me.example.com'
const HOME = '@me.example.com'
const COMMUNITY = '@team.example.com'
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

// 'idle' must never read as settled: it is what the FIRST render of a cross-owner file sees, and
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

describe('deriveFileOwnerScope: same-tenant files', () => {
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

	it('leaves an ownerless row on our OWN node alone', () => {
		// The tenant-owned short-circuit in canManageFile is legitimate here: this IS our node
		const scope = derive({ file: {}, contextIdTag: HOME })
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.scopedFile.owner).toBeUndefined()
		expect(scope.canManageFile).toBe(true)
	})

	/*
	 * An ownerless row in a COMMUNITY context belongs to the community, not to whoever is looking at
	 * it. Without the back-fill a plain member gets the Rename button, the Visibility dropdown and
	 * editable Tags on every community file - all three 403. canManageShares is right on its own
	 * (its tenantOwned branch needs creator or leader), so only canManageFile needs this.
	 */
	it('refuses an ownerless community row to a plain member', () => {
		const scope = derive({ file: {}, contextIdTag: COMMUNITY, contextRoles: [] })
		expect(scope.scopedFile.owner).toEqual({ idTag: COMMUNITY })
		expect(scope.canManageFile).toBe(false)
		expect(scope.canManageShares).toBe(false)
	})

	it('grants the same row to a moderator of that community', () => {
		const scope = derive({ file: {}, contextIdTag: COMMUNITY, contextRoles: ['moderator'] })
		expect(scope.canManageFile).toBe(true)
	})
})

describe('deriveFileOwnerScope: cross-owner files', () => {
	const foreign = { file: { owner: { idTag: OTHER } }, contextIdTag: COMMUNITY }

	it('grants nothing while the owner lookup is in flight', () => {
		const scope = derive({ ...foreign, ownerStatus: 'loading', contextRoles: ['leader'] })
		expect(scope.isCrossOwner).toBe(true)
		expect(scope.resolving).toBe(true)
		expectGrantsNothing(scope)
	})

	it('counts the first render, before the effect has run, as still resolving', () => {
		// 'idle' is what the state initialiser leaves behind on that render
		expect(derive({ ...foreign, ownerStatus: 'idle' }).resolving).toBe(true)
	})

	/**
	 * THE regression this file exists for. A refused proxy token must not fall back to the active
	 * context: `scopeIdTag` stays the OWNER and every permission stays false. Falling back to
	 * contextIdTag/contextRoles on 'failed' would hand a leader of COMMUNITY full share rights over
	 * a file owned by OTHER - the leak in its original form.
	 */
	it('points at the owner and grants nothing when the lookup is refused', () => {
		const scope = derive({ ...foreign, ownerStatus: 'failed', contextRoles: ['leader'] })
		expect(scope.resolving).toBe(false)
		expect(scope.scopeIdTag).toBe(OTHER)
		expect(scope.scopeIdTag).not.toBe(COMMUNITY)
		expect(scope.scopeRoles).toEqual([])
		expectGrantsNothing(scope)
	})

	it('ignores roles held on the ACTIVE context once the owner has answered', () => {
		const scope = derive({
			...foreign,
			ownerStatus: 'ready',
			// leader of COMMUNITY, nothing at all on OTHER
			contextRoles: ['leader'],
			ownerRoles: []
		})
		expect(scope.scopeRoles).toEqual([])
		expect(scope.canManageShares).toBe(false)
		expect(scope.canManageFile).toBe(false)
	})

	it('honours roles actually held on the owner', () => {
		const scope = derive({ ...foreign, ownerStatus: 'ready', ownerRoles: ['leader'] })
		expect(scope.canManageShares).toBe(true)
	})

	it('back-fills an ownerless row to the scope tenant with an override', () => {
		// Ownerless rows served by a FOREIGN node belong to that node, not to us - without the
		// substitution canManageFile's ownerless short-circuit would return true before any role
		// was consulted.
		const scope = derive({
			file: {},
			contextIdTag: HOME,
			override: { idTag: OTHER, roles: [] }
		})
		expect(scope.scopedFile.owner).toEqual({ idTag: OTHER })
		expect(scope.canManageFile).toBe(false)
	})

	it('still reports canManageFile for our OWN cross-owner file while resolving', () => {
		// Why consumers must check `resolving` as well as the flags: the owner branch needs no
		// roles, so this is true before any node has been reached - and `api` is still null.
		const scope = derive({
			file: { owner: { idTag: ME } },
			contextIdTag: COMMUNITY,
			ownerStatus: 'loading'
		})
		expect(scope.resolving).toBe(true)
		expect(scope.canManageFile).toBe(true)
	})

	it('grants nothing while the active context is unknown', () => {
		const scope = derive({ file: { owner: { idTag: OTHER } }, contextIdTag: undefined })
		expect(scope.scopeUnresolved).toBe(true)
		expect(scope.resolving).toBe(true)
		expectGrantsNothing(scope)
	})

	/**
	 * A cross-owner row's `accessLevel` came from the ACTIVE context's list response, while
	 * `scopeIdTag`/`scopeRoles` describe the OWNER's node. canReadShares reads `accessLevel`
	 * directly, so leaving it on let a community's cached 'write' vouch for standing on another
	 * tenant - the same leak in a different currency. The derivation strips it.
	 */
	it('does not let the active context`s access level vouch for the owner`s node', () => {
		const withAccess = {
			file: { owner: { idTag: OTHER }, accessLevel: 'write' as const },
			contextIdTag: COMMUNITY
		}
		expectGrantsNothing(derive({ ...withAccess, ownerStatus: 'loading' }))
		const ready = derive({ ...withAccess, ownerStatus: 'ready', ownerRoles: [] })
		expect(ready.scopedFile.accessLevel).toBeUndefined()
		expect(ready.canReadShares).toBe(false)
	})

	/*
	 * The same leak in the strongest currency there is: `canManageShares` returns true on
	 * `accessLevel === 'admin'` alone, so a cached 'admin' from the ACTIVE context would hand out
	 * share management on ANOTHER tenant's row if the strip did not run first. Which is what makes
	 * ShareDialog's `hasAdminGrant` fallback the only legitimate route on cross-owner rows.
	 */
	it('strips a cached `admin` level too, so it cannot confer share management elsewhere', () => {
		const withAdmin = {
			file: { owner: { idTag: OTHER }, accessLevel: 'admin' as const },
			contextIdTag: COMMUNITY
		}
		const ready = derive({ ...withAdmin, ownerStatus: 'ready', ownerRoles: [] })
		expect(ready.scopedFile.accessLevel).toBeUndefined()
		expectGrantsNothing(ready)
	})

	// ...and on a SAME-owner row nothing is stripped, so the grant does its job.
	it('keeps `admin` on a same-owner row, where it is the owner node`s own answer', () => {
		const scope = derive({
			file: { owner: { idTag: COMMUNITY }, accessLevel: 'admin' as const },
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
	it('is admin for the owner and for a leader over the tenant`s own row', () => {
		expect(derive({ file: { owner: { idTag: ME } } }).grantCeiling).toBe('admin')
		expect(
			derive({
				file: { owner: { idTag: COMMUNITY } },
				contextIdTag: COMMUNITY,
				contextRoles: ['leader']
			}).grantCeiling
		).toBe('admin')
	})

	// The creator rule makes them a share manager; the ceiling is what stops them minting more
	// access than they hold.
	it('caps a Read-level creator of a community file at read', () => {
		const scope = derive({
			file: { creator: { idTag: ME }, accessLevel: 'read' },
			contextIdTag: COMMUNITY
		})
		expect(scope.canManageShares).toBe(true)
		expect(scope.grantCeiling).toBe('read')
	})

	/*
	 * A cross-owner row has had `accessLevel` stripped, so nothing here knows the real ceiling.
	 * Guessing low would grey out the menu for a legitimate manager - `getMetadata` is what refines
	 * it in ShareDialog, and the server is the enforcer either way.
	 */
	it('is unrestricted on a cross-owner row, where the level has been stripped', () => {
		const scope = derive({
			file: { owner: { idTag: OTHER }, accessLevel: 'read' },
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
			file: { owner: { idTag: OTHER } },
			contextIdTag: COMMUNITY,
			// Would be a cross-owner lookup without the override, and would grant nothing
			ownerStatus: 'loading',
			contextRoles: [],
			override
		})
		expect(scope.isCrossOwner).toBe(false)
		expect(scope.resolving).toBe(false)
		expect(scope.scopeIdTag).toBe(OTHER)
		expect(scope.scopeRoles).toEqual(['leader'])
		expect(scope.canManageShares).toBe(true)
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

	// An override that names no tenant decides nothing: with no scopeIdTag the ownerless back-fill is
	// skipped and canManageFile's ownerless short-circuit would hand back `true` against a node we
	// cannot even name.
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

// The single flag both the derivation and useFileOwnerScope's effect branch on: computing it
// separately would let a change to one reading silently split the affordance from the node.
describe('isCrossOwnerFile', () => {
	it('is true only for a named foreign owner with a known context and no override', () => {
		expect(isCrossOwnerFile(OTHER, COMMUNITY, false)).toBe(true)
		expect(isCrossOwnerFile(COMMUNITY, COMMUNITY, false)).toBe(false)
		expect(isCrossOwnerFile(undefined, COMMUNITY, false)).toBe(false)
		expect(isCrossOwnerFile(OTHER, undefined, false)).toBe(false)
	})

	it('is false whenever an override names the node', () => {
		// The override IS the answer - no owner lookup happens at all
		expect(isCrossOwnerFile(OTHER, COMMUNITY, true)).toBe(false)
		expect(isCrossOwnerFile(undefined, undefined, true)).toBe(false)
	})
})

/**
 * What stays out of reach here, because it lives in effects and in a hook return rather than in a
 * pure derivation, and `shell` has no @testing-library/react:
 *
 *   - `useFileOwnerScope`'s `acquireOwnerApi` — the `setOwnerState({ status: 'loading', ... })`
 *     INSIDE the cross-owner branch. `isCrossOwner` stays true when `ownerIdTag` changes from one
 *     foreign tenant to another, so that write must happen before any await or the previous owner's
 *     client and roles survive into the new owner's render.
 *   - the hook's three-way choice of `api` (override → owner's client → active context), which the
 *     derivation cannot own because it holds no ApiClient. It branches on `scopeUnresolved` and
 *     `isCrossOwner`, both covered above.
 *   - `useFileNavigation`'s `acquireRemoteApi` — `setRemoteApi(null)` / `setRemoteRoles([])`.
 *     FilesApp pairs those with the NEW owner's idTag in `remoteScope`, so a late reset hands
 *     DetailsPanel and ShareDialog a client and a standing belonging to different tenants.
 */
describe('uncovered: the owner-state loading reset and the api branch', () => {
	it.todo('resets client and roles before awaiting a new owner — see the note above')
})

// vim: ts=4
