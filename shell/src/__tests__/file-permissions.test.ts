// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { File } from '../apps/files/types.js'
import {
	canManageFile,
	canManageShares,
	canReadShares,
	canWrite,
	hasAdminGrant,
	isAdminPerm,
	levelsAboveCeiling,
	linkGrantCeiling,
	scopeFileToTenant,
	shareGrantCeiling,
	toAppAccess,
	toSharePermChar
} from '../apps/files/utils.js'

const TENANT = 'community.example'
const ME = 'alice.example'
const OTHER = 'bob.example'

function file(owner?: string, creator?: string): File {
	return {
		fileId: 'f1',
		fileName: 'doc',
		contentType: 'text/plain',
		createdAt: '2026-01-01T00:00:00Z',
		preset: '',
		owner: owner ? { idTag: owner } : undefined,
		creator: creator ? { idTag: creator } : undefined
	}
}

// Mirrors the `is_share_manager` table in ../cloudillo-rs/crates/cloudillo-core/src/share_access.rs.
// The explicit 'A' share grant arrives as `accessLevel: 'admin'` on ordinary list rows, so it IS
// reproducible here — for same-owner rows. It stays invisible on CROSS-OWNER rows, where
// `deriveFileOwnerScope` strips `accessLevel`; there `hasAdminGrant` recovers it from entries the
// ShareDialog already fetched.
describe('canManageShares', () => {
	it('allows a leader over the serving tenant`s OWN rows, and only those', () => {
		expect(canManageShares(file(TENANT, OTHER), ME, TENANT, ['leader'])).toBe(true)
		// `leader_over_tenant_row = is_leader(roles) && owner_id_tag == tenant_id_tag`: leadership is
		// authority over the tenant's own content, never over a foreign owner's row that merely sits
		// here as a Pin/Place copy. The roles passed are the ones held on the SERVING node, which is
		// what useFileOwnerScope derives; passing the wrong node's roles is the caller's bug.
		expect(canManageShares(file(OTHER, OTHER), ME, TENANT, ['leader'])).toBe(false)
	})

	it('allows the file owner', () => {
		expect(canManageShares(file(ME, OTHER), ME, TENANT, [])).toBe(true)
	})

	it('allows the creator of a tenant-owned file', () => {
		expect(canManageShares(file(TENANT, ME), ME, TENANT, ['contributor'])).toBe(true)
	})

	it('rejects the creator when the file is owned by someone else', () => {
		expect(canManageShares(file(OTHER, ME), ME, TENANT, ['contributor'])).toBe(false)
	})

	it('rejects a moderator who is neither owner nor creator', () => {
		expect(canManageShares(file(TENANT, OTHER), ME, TENANT, ['moderator'])).toBe(false)
	})

	it('rejects a plain member', () => {
		expect(canManageShares(file(TENANT, OTHER), ME, TENANT, [])).toBe(false)
	})

	it('rejects an anonymous caller even on a tenant-owned file', () => {
		expect(canManageShares(file(TENANT, undefined), undefined, TENANT, [])).toBe(false)
	})

	it('treats an ownerless file as tenant-owned, so only its creator qualifies', () => {
		expect(canManageShares(file(undefined, ME), ME, TENANT, [])).toBe(true)
		expect(canManageShares(file(undefined, OTHER), ME, TENANT, [])).toBe(false)
	})

	// The roles argument is load-bearing: the predicate cannot tell which node they came from, so
	// the CALLER must pass the ones held on the node that will serve the request. The active
	// context's roles for a file served elsewhere open the full share UI and then 403.
	it('grants nothing of its own on a foreign file - the caller owns the roles argument', () => {
		const foreign = file(OTHER, OTHER)
		// Judged against the owner's node, where the proxy token grants us nothing
		expect(canManageShares(foreign, ME, OTHER, [])).toBe(false)
	})

	// ...and the flip side: real standing on the owner's node still qualifies
	it('honours a leader role granted by the owner`s own node', () => {
		expect(canManageShares(file(OTHER, OTHER), ME, OTHER, ['leader'])).toBe(true)
	})

	/*
	 * ContextMenu's approximation of useFileOwnerScope. The menu will not fetch a proxy token per
	 * row on right-click, so for a CROSS-OWNER row it passes `[]` instead of the active context's
	 * roles. That is now belt-and-braces rather than the only thing preventing the false affordance:
	 * the leader branch is itself confined to tenant-owned rows, so a foreign-owned row is refused
	 * either way. Both readings of the same row stay pinned here.
	 */
	it('offers nothing on a foreign-owned row, with or without the leader role', () => {
		const foreign = file(OTHER, OTHER)
		// The ACTIVE context's roles, judged against a foreign owner - refused by the tenant-owned
		// gate even though the role itself is real somewhere
		expect(canManageShares(foreign, ME, TENANT, ['leader'])).toBe(false)
		// What ContextMenu passes, matching what the dialog will conclude
		expect(canManageShares(foreign, ME, TENANT, [])).toBe(false)
	})

	it('still recognises our own file while a community context is active', () => {
		// Cross-owner by idTag, so ContextMenu withholds the roles - and the owner branch, which
		// needs none, still fires. This is why withholding them is safe.
		expect(canManageShares(file(ME, OTHER), ME, TENANT, [])).toBe(true)
	})

	/*
	 * Backend gate 0: `is_share_manager` returns false on `access == AccessLevel::None` BEFORE it
	 * looks at is_leader / has_admin_grant / owner == subject
	 * (cloudillo-rs crates/cloudillo-core/src/share_access.rs:71). Reachability is not something
	 * leadership or ownership can substitute for; without this gate the predicate offers "Share…"
	 * on a row the server would refuse outright.
	 */
	it('rejects an unreachable row whatever the standing', () => {
		const unreachable = { ...file(ME, ME), accessLevel: 'none' as const }
		expect(canManageShares(unreachable, ME, TENANT, [])).toBe(false)
		expect(canManageShares(unreachable, ME, TENANT, ['leader'])).toBe(false)
		expect(
			canManageShares({ ...file(TENANT, ME), accessLevel: 'none' }, ME, TENANT, ['leader'])
		).toBe(false)
	})

	it('is unaffected when the access level is absent or write', () => {
		expect(canManageShares(file(ME, OTHER), ME, TENANT, [])).toBe(true)
		expect(canManageShares({ ...file(ME, OTHER), accessLevel: 'write' }, ME, TENANT, [])).toBe(
			true
		)
		expect(
			canManageShares({ ...file(TENANT, OTHER), accessLevel: 'write' }, ME, TENANT, [])
		).toBe(false)
	})

	it('gives a remote tenant`s file no standing from roles held elsewhere', () => {
		// Ownerless on the remote node: nothing in the file names the tenant, so the caller must
		// pass the browsed tenant's idTag or a leader role from home leaks straight through.
		expect(canManageShares(file(undefined, OTHER), ME, 'remote.example', [])).toBe(false)
		// Ownerless === tenant-owned (the backend's `effective_owner`), so leadership DOES apply
		expect(canManageShares(file(undefined, OTHER), ME, TENANT, ['leader'])).toBe(true)
		/*
		 * ...and an ownerless row stays "tenant-owned" whatever tenant is named, so the predicate
		 * alone cannot tell a remote node's own file from ours. Naming the serving tenant as the
		 * owner is what closes it - `scopeFileToTenant`, which every caller judging a foreign node
		 * runs first. A leader role held at HOME then confers nothing there.
		 */
		const remote = scopeFileToTenant(file(undefined, OTHER), ME, 'remote.example')
		expect(canManageShares(remote, ME, TENANT, ['leader'])).toBe(false)
		// ...while real leadership on that node still qualifies
		expect(canManageShares(remote, ME, 'remote.example', ['leader'])).toBe(true)
	})

	/*
	 * The 'A' grant, which the backend resolves into the access level itself
	 * (`AccessLevel::from_perm_char('A') == Admin`) and reports on every `GET /api/files` row.
	 * Without it an admin grantee is a false negative until the ShareDialog's `hasAdminGrant` runs.
	 */
	it("recognises an 'A' grantee who is neither owner, creator nor leader", () => {
		const granted = { ...file(OTHER, OTHER), accessLevel: 'admin' as const }
		expect(canManageShares(granted, ME, TENANT, [])).toBe(true)
		// ...on the owner's own node too, where they hold no roles at all.
		expect(canManageShares(granted, ME, OTHER, [])).toBe(true)
		// A plain write grant on the same row still confers nothing.
		expect(canManageShares({ ...granted, accessLevel: 'write' }, ME, TENANT, [])).toBe(false)
	})

	it("does not let 'admin' override the unreachable gate", () => {
		// Gate 0 runs first; 'none' and 'admin' are mutually exclusive server-side, but the
		// ordering is what makes that safe rather than incidental.
		expect(
			canManageShares({ ...file(ME, ME), accessLevel: 'none' }, ME, TENANT, ['leader'])
		).toBe(false)
	})

	/*
	 * Why `hasAdminGrant` survives: `deriveFileOwnerScope` (utils.ts) hands cross-owner rows to
	 * this predicate with `accessLevel: undefined`, because the ACTIVE context's cached level is
	 * not the OWNER node's answer. The 'admin' branch above is therefore invisible there, and the
	 * ShareDialog's `hasAdminGrant` fallback is the only thing that recovers the grant.
	 */
	it('cannot see an admin grant once the cross-owner scope has stripped the level', () => {
		const stripped = { ...file(OTHER, OTHER), accessLevel: undefined }
		expect(canManageShares(stripped, ME, TENANT, [])).toBe(false)
		expect(hasAdminGrant([{ subjectType: 'U', subjectId: ME, permission: 'A' }], ME)).toBe(true)
	})
})

/*
 * Mirrors `grant_ceiling` (cloudillo-rs crates/cloudillo-core/src/share_access.rs): being a share
 * MANAGER says nothing about how much access one may hand out. `ensure_grant_within` caps every
 * mint and widen at the caller's own level, so the creator rule cannot be used to escalate.
 */
describe('shareGrantCeiling / linkGrantCeiling', () => {
	it('gives the owner everything', () => {
		expect(shareGrantCeiling(file(ME, OTHER), ME, TENANT, [])).toBe('admin')
		// ...capped into the link vocabulary, which has no admin
		expect(linkGrantCeiling(file(ME, OTHER), ME, TENANT, [])).toBe('WRITE')
	})

	it('gives a leader everything over the tenant`s OWN row', () => {
		expect(shareGrantCeiling(file(TENANT, OTHER), ME, TENANT, ['leader'])).toBe('admin')
		// ...and an ownerless row is the same row
		expect(shareGrantCeiling(file(undefined, OTHER), ME, TENANT, ['leader'])).toBe('admin')
	})

	// The other half of `leader_over_tenant_row`: over foreign content a leader is judged on their
	// own access alone, exactly as `grant_ceiling(access, false, false)` does.
	it('falls back to the file`s own level for a leader over a foreign-owned row', () => {
		const pinned = { ...file(OTHER, OTHER), accessLevel: 'comment' as const }
		expect(shareGrantCeiling(pinned, ME, TENANT, ['leader'])).toBe('comment')
		expect(linkGrantCeiling(pinned, ME, TENANT, ['leader'])).toBe('COMMENT')
	})

	// THE case the ceiling exists for: a Read-level creator manages the shares (creator rule) but
	// may not mint a write grant and redeem it.
	it('caps a Read-level creator of a tenant-owned file at read', () => {
		const f = { ...file(TENANT, ME), accessLevel: 'read' as const }
		expect(canManageShares(f, ME, TENANT, [])).toBe(true)
		expect(shareGrantCeiling(f, ME, TENANT, [])).toBe('read')
		expect(linkGrantCeiling(f, ME, TENANT, [])).toBe('READ')
	})

	/*
	 * An absent level means "not computed", not "no access": `deriveFileOwnerScope` strips it on
	 * cross-owner rows. Guessing low there would grey out the menu for a legitimate manager, so the
	 * fallback is unrestricted and the SERVER stays the enforcer - its refusal is what
	 * `shareLinkErrorMessage` explains.
	 */
	it('is unrestricted when the level is unknown', () => {
		expect(shareGrantCeiling(file(OTHER, OTHER), ME, TENANT, [])).toBe('admin')
		expect(linkGrantCeiling(file(OTHER, OTHER), ME, TENANT, [])).toBe('WRITE')
	})

	it('reports the levels a ceiling forbids', () => {
		expect(levelsAboveCeiling('READ')).toEqual(['COMMENT', 'WRITE'])
		expect(levelsAboveCeiling('COMMENT')).toEqual(['WRITE'])
		expect(levelsAboveCeiling('WRITE')).toEqual([])
	})
})

// canManageFile stays looser on purpose: the backend did not tighten rename /
// delete / visibility, so moderators and non-creator members keep those.
describe('canManageFile vs canManageShares', () => {
	it('lets a moderator manage but not re-share a community file', () => {
		const f = file(TENANT, OTHER)
		expect(canManageFile(f, ME, ['moderator'])).toBe(true)
		expect(canManageShares(f, ME, TENANT, ['moderator'])).toBe(false)
	})

	it('lets any context member manage but not re-share an ownerless file', () => {
		const f = file(undefined, OTHER)
		expect(canManageFile(f, ME, [])).toBe(true)
		expect(canManageShares(f, ME, TENANT, [])).toBe(false)
	})

	// Both are now judged against the SCOPE - the node in `api` - not the active context. The
	// roles argument is the only thing that carries that, so a moderator role held on the wrong
	// node must never be passed here; useFileOwnerScope is what gets it right.
	it('judges canManageFile against the scope roles it is handed', () => {
		const f = file(OTHER, OTHER)
		// Moderator on the owner's node: rename/delete/visibility are allowed there
		expect(canManageFile(f, ME, ['moderator'])).toBe(true)
		// No standing on that node: the visibility dropdown must not render
		expect(canManageFile(f, ME, [])).toBe(false)
	})

	/*
	 * ContextMenu withholds the active context's roles from canManageFile too, for the same reason
	 * it withholds them from canManageShares: a leader of TENANT looking at a row owned by OTHER was
	 * offered a visibility change the menu cannot even route (it holds no owner-scoped client) and
	 * that DetailsPanel, which resolves OTHER's roles, hides.
	 */
	it('offers no visibility standing on a foreign-owned row when the leader role is withheld', () => {
		const foreign = file(OTHER, OTHER)
		// The ACTIVE context's roles, judged against a foreign owner - the wrong node's answer
		expect(canManageFile(foreign, ME, ['leader'])).toBe(true)
		// What ContextMenu passes
		expect(canManageFile(foreign, ME, [])).toBe(false)
		// ...and our own file is unaffected: the owner branch needs no roles
		expect(canManageFile(file(ME, OTHER), ME, [])).toBe(true)
	})
})

/*
 * canManageFile short-circuits to `true` on an ownerless file - "owned by the tenant we are
 * talking to", which is right for our OWN node and wrong for anyone else's. A remote tenant serves
 * its own files with no owner tag, so while remote-browsing every row came back manageable no
 * matter what roles were held there: the full visibility/rename UI, then a 403.
 *
 * The predicate is not the place to fix that - ContextMenu depends on the ownerless branch - so the
 * callers that judge a FOREIGN node (useFileOwnerScope, MediaPickerBrowseTab's canUnlock) fill in
 * the serving tenant as an explicit owner first. These pin both halves of that substitution.
 */
describe('ownerless files across nodes', () => {
	it('grants an ownerless file to a roleless caller - the local-node case', () => {
		expect(canManageFile(file(undefined, OTHER), ME, [])).toBe(true)
	})

	it('refuses the same file once the serving tenant is named as its owner', () => {
		const scoped = { ...file(undefined, OTHER), owner: { idTag: OTHER } }
		expect(canManageFile(scoped, ME, [])).toBe(false)
		expect(canManageShares(scoped, ME, OTHER, [])).toBe(false)
	})

	// The substitution must not hand out anything the roles do not already carry
	it('still allows a caller with standing on that foreign node', () => {
		const scoped = { ...file(undefined, OTHER), owner: { idTag: OTHER } }
		expect(canManageFile(scoped, ME, ['moderator'])).toBe(true)
		expect(canManageShares(scoped, ME, OTHER, ['leader'])).toBe(true)
	})

	// ...and the owner themselves is unaffected either way
	it('leaves our own ownerless file alone when the tenant is us', () => {
		const scoped = { ...file(undefined, ME), owner: { idTag: ME } }
		expect(canManageFile(scoped, ME, [])).toBe(true)
	})
})

// The substitution itself, shared by deriveFileOwnerScope, ContextMenu and MediaPickerBrowseTab so
// all three judge a foreign node the same way.
describe('scopeFileToTenant', () => {
	it('leaves a row that already names its owner alone', () => {
		const owned = file(OTHER, OTHER)
		expect(scopeFileToTenant(owned, ME, TENANT)).toBe(owned)
	})

	it('leaves an ownerless row alone when the serving tenant is us', () => {
		const ownerless = file(undefined, ME)
		expect(scopeFileToTenant(ownerless, ME, ME)).toBe(ownerless)
		// ...and with no tenant to name there is nothing to substitute
		expect(scopeFileToTenant(ownerless, ME, undefined)).toBe(ownerless)
	})

	it('names a foreign serving tenant as the owner', () => {
		const scoped = scopeFileToTenant(file(undefined, OTHER), ME, TENANT)
		expect(scoped.owner).toEqual({ idTag: TENANT })
		// ...which is exactly what closes canManageFile's ownerless short-circuit
		expect(canManageFile(scoped, ME, [])).toBe(false)
	})
})

/*
 * ContextMenu approximates useFileOwnerScope without mounting it (the hook fetches a proxy token
 * per file, which the menu will not do on every right-click). The hook strips `accessLevel` on a
 * cross-owner row because the ACTIVE context's cached level is not the owner node's answer — and
 * once `accessLevel: 'admin'` started arriving on ordinary rows, a menu that skipped the strip
 * offered "Share…" on a foreign-owned pinned copy, then opened a dialog that refused it.
 */
describe('ContextMenu`s cross-owner accessLevel strip', () => {
	it('needs the local `admin` level stripped before it agrees with the dialog', () => {
		const pinned = { ...file(OTHER, OTHER), accessLevel: 'admin' as const }
		// What the menu would conclude passing the row raw, even with the roles withheld
		expect(canManageShares(pinned, ME, TENANT, [])).toBe(true)
		// What it concludes now, matching deriveFileOwnerScope and therefore the dialog
		expect(canManageShares({ ...pinned, accessLevel: undefined }, ME, TENANT, [])).toBe(false)
	})
})

// Mirrors the backend `is_share_reader`: write access is enough to ENUMERATE a file's shares, even
// though changing them needs the manager standing above.
describe('canReadShares', () => {
	function withAccess(f: File, accessLevel: File['accessLevel']): File {
		return { ...f, accessLevel }
	}

	it('passes anyone who can manage the shares', () => {
		expect(canReadShares(file(ME, OTHER), ME, TENANT, [])).toBe(true)
	})

	it('passes a `W` grantee who cannot manage them', () => {
		const f = withAccess(file(OTHER, OTHER), 'write')
		expect(canManageShares(f, ME, OTHER, [])).toBe(false)
		expect(canReadShares(f, ME, OTHER, [])).toBe(true)
	})

	it('rejects a read-only grantee', () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'read'), ME, OTHER, [])).toBe(false)
	})

	// 'admin' outranks 'write', so it passes twice over: canManageShares admits it outright, and
	// the canWrite() fallback would too.
	it("passes an 'A' grantee", () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'admin'), ME, OTHER, [])).toBe(true)
	})

	// `is_share_reader` requires Write, not Read (share_access.rs:86) - comment access is not enough
	// to enumerate, and 'none' is refused by canManageShares' gate 0 as well.
	it('rejects comment and unreachable access', () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'comment'), ME, OTHER, [])).toBe(false)
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'none'), ME, OTHER, [])).toBe(false)
		// ...even for the owner, since gate 0 fires ahead of the ownership test
		expect(canReadShares(withAccess(file(ME, ME), 'none'), ME, TENANT, ['leader'])).toBe(false)
	})

	// `compute_file_access_levels` fills accessLevel on every list row; it is absent only on rows the
	// shell built itself and on metadata responses, where the rename/delete standing is the best
	// proxy we have for "has write access".
	it('falls back to canManageFile when accessLevel is absent', () => {
		expect(canReadShares(file(TENANT, OTHER), ME, TENANT, ['moderator'])).toBe(true)
		expect(canReadShares(file(OTHER, OTHER), ME, OTHER, [])).toBe(false)
	})
})

describe('isAdminPerm', () => {
	it("recognises only 'A'", () => {
		expect(isAdminPerm('A')).toBe(true)
		expect(isAdminPerm('W')).toBe(false)
		expect(isAdminPerm('C')).toBe(false)
		expect(isAdminPerm('R')).toBe(false)
		expect(isAdminPerm(undefined)).toBe(false)
	})
})

/*
 * The cross-owner fallback: `deriveFileOwnerScope` strips `accessLevel` on rows whose owner is
 * not the active context, so `canManageShares`' 'admin' branch cannot fire there. This recovers
 * the grant from entries the caller has already fetched — ShareDialog is the only place that has
 * them, which is why a cross-owner 'A' grant still reads as a false negative at every entry point
 * before the dialog opens.
 */
describe('hasAdminGrant', () => {
	type GrantEntry = NonNullable<Parameters<typeof hasAdminGrant>[0]>[number]

	function entry(subjectId: string, permission: string, subjectType = 'U'): GrantEntry {
		return { subjectType, subjectId, permission } as GrantEntry
	}

	it("finds our own 'A' entry", () => {
		expect(hasAdminGrant([entry(OTHER, 'W'), entry(ME, 'A')], ME)).toBe(true)
	})

	it('rejects a plain write grant for the same user', () => {
		expect(hasAdminGrant([entry(ME, 'W')], ME)).toBe(false)
	})

	it("rejects an 'A' entry belonging to someone else", () => {
		expect(hasAdminGrant([entry(OTHER, 'A')], ME)).toBe(false)
	})

	it("ignores a non-'U' subject holding 'A'", () => {
		// File-share entries ('F') name a document, not a person
		expect(hasAdminGrant([entry(ME, 'A', 'F')], ME)).toBe(false)
	})

	it('is false with nothing to judge', () => {
		expect(hasAdminGrant(undefined, ME)).toBe(false)
		expect(hasAdminGrant([entry(ME, 'A')], undefined)).toBe(false)
	})
})

// The single comparison that replaced every `accessLevel === 'write'` in the shell. An equality
// test locks out the owner, a community leader and every 'A' grantee, all of whom now resolve to
// 'admin' server-side.
describe('canWrite', () => {
	it('accepts write and admin', () => {
		expect(canWrite('write')).toBe(true)
		expect(canWrite('admin')).toBe(true)
	})

	it('rejects everything below write', () => {
		expect(canWrite('comment')).toBe(false)
		expect(canWrite('read')).toBe(false)
		expect(canWrite('none')).toBe(false)
	})

	// An absent level means "not computed", not "no access" — the callers that care branch on it
	// separately (canReadShares falls back to canManageFile).
	it('rejects an absent level', () => {
		expect(canWrite(undefined)).toBe(false)
	})
})

// Apps get a 3-valued vocabulary; the shell caps the level before handing it to a sandboxed app.
describe('toAppAccess', () => {
	it("caps admin at 'write'", () => {
		expect(toAppAccess('admin')).toBe('write')
		expect(toAppAccess('write')).toBe('write')
	})

	it('passes comment through', () => {
		expect(toAppAccess('comment')).toBe('comment')
	})

	it("reads 'none' and an absent level as 'read'", () => {
		// A file the shell has already opened is at least readable; this is what the old
		// `accessLevel === 'none' ? 'read' : accessLevel` ternary did at every call site.
		expect(toAppAccess('none')).toBe('read')
		expect(toAppAccess(undefined)).toBe('read')
		expect(toAppAccess('read')).toBe('read')
	})
})

// Mirrors the backend's fail-safe `AccessLevel::from_perm_char`: `tShareEntry.permission` stays a
// plain string so one corrupt row cannot fail the decode of the whole share list.
describe('toSharePermChar', () => {
	it('passes the vocabulary through unchanged', () => {
		expect(toSharePermChar('R')).toBe('R')
		expect(toSharePermChar('C')).toBe('C')
		expect(toSharePermChar('W')).toBe('W')
		expect(toSharePermChar('A')).toBe('A')
	})

	it("normalizes anything else to 'R'", () => {
		expect(toSharePermChar('X')).toBe('R')
		expect(toSharePermChar('')).toBe('R')
		expect(toSharePermChar('write')).toBe('R')
		expect(toSharePermChar(undefined)).toBe('R')
		expect(toSharePermChar(null)).toBe('R')
		expect(toSharePermChar(7)).toBe('R')
	})

	it('accepts a String object, as the runtype decoder can produce', () => {
		expect(toSharePermChar(new String('A'))).toBe('A')
	})
})

// vim: ts=4
