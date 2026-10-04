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
	resolveAccessLevel,
	shareGrantCeiling,
	toAppAccess,
	toSharePermChar,
	visibilityRank
} from '../apps/files/utils.js'

const TENANT = 'community.example'
const ME = 'alice.example'
const OTHER = 'bob.example'

/**
 * `owner` is AUTHORITY (back-filled to the serving tenant, so effectively always present);
 * `upstream` is PROVENANCE — set only on a mirrored row, whose canonical copy lives elsewhere.
 * The two were swapped and renamed in backend migration 49; nothing here reads `owner` as a
 * cross-context signal any more.
 */
function file(owner?: string, upstream?: string): File {
	return {
		entryId: 'e1',
		fileId: 'f1',
		fileName: 'doc',
		contentType: 'text/plain',
		createdAt: '2026-01-01T00:00:00Z',
		preset: '',
		owner: owner ? { idTag: owner } : undefined,
		upstream: upstream ? { idTag: upstream } : undefined
	}
}

/*
 * Mirrors `get_access_level`'s owner shortcut and role ladder
 * (../cloudillo-rs/crates/cloudillo-core/src/file_access.rs), both gated on
 * `upstream_id_tag.is_none()`. It exists because `GET /api/files/{id}/metadata` deliberately SKIPS
 * the computation for a same-tenant caller on a locally originating row.
 */
describe('resolveAccessLevel', () => {
	it('returns the server`s own answer whenever one arrived', () => {
		// ...even one that contradicts the ladder: the server saw grants we cannot
		expect(resolveAccessLevel({ ...file(OTHER), accessLevel: 'read' }, ME, ['leader'])).toBe(
			'read'
		)
		expect(resolveAccessLevel({ ...file(ME), accessLevel: 'none' }, ME, [])).toBe('none')
	})

	/*
	 * ...including on a MIRRORED row: the serving node is authoritative about its own copy, which
	 * is what the record predicates act on. That is also why a caller holding a FOREIGN node's
	 * answer must strip it first, as `deriveFileOwnerScope` does - otherwise it reads as a grant.
	 */
	it('returns the served answer for a mirrored row', () => {
		expect(resolveAccessLevel({ ...file(ME, OTHER), accessLevel: 'write' }, ME, [])).toBe(
			'write'
		)
	})

	it('gives the owner of a locally originating row admin', () => {
		expect(resolveAccessLevel(file(ME), ME, [])).toBe('admin')
	})

	it('walks the role ladder on a locally originating row', () => {
		expect(resolveAccessLevel(file(TENANT), ME, ['leader'])).toBe('admin')
		expect(resolveAccessLevel(file(TENANT), ME, ['moderator'])).toBe('write')
		expect(resolveAccessLevel(file(TENANT), ME, ['contributor'])).toBe('write')
		expect(resolveAccessLevel(file(TENANT), ME, ['supporter'])).toBe('read')
		expect(resolveAccessLevel(file(TENANT), ME, ['follower'])).toBe('read')
		// Not "has any role": only the three rungs `role_access_level` names
		expect(resolveAccessLevel(file(TENANT), ME, ['public'])).toBe('read')
		expect(resolveAccessLevel(file(TENANT), ME, ['blocked'])).toBeUndefined()
		// No roles at all is no standing, not read access
		expect(resolveAccessLevel(file(TENANT), ME, [])).toBeUndefined()
	})

	/*
	 * A mirrored row's standing is the UPSTREAM node's to decide, and `deriveFileOwnerScope` strips
	 * the active context's cached level before we get here. Neither ownership nor leadership may
	 * fill that in - a refusal is not a grant.
	 */
	it('answers nothing about a mirrored row it was sent no level for', () => {
		expect(resolveAccessLevel(file(ME, OTHER), ME, ['leader'])).toBeUndefined()
		expect(resolveAccessLevel(file(TENANT, OTHER), ME, ['leader'])).toBeUndefined()
	})
})

// Mirrors the `is_share_manager` table in ../cloudillo-rs/crates/cloudillo-core/src/share_access.rs.
// The owner test and the creator rule are GONE from the backend: the owner of a locally originating
// row already resolves to 'admin' through the ladder above, so a separate branch would only widen it
// onto mirrored rows, which is exactly the split this file pins.
describe('canManageShares', () => {
	/*
	 * The deliberate widening in the ownership cleanup. `leader_over_local_row = is_leader(roles)
	 * && upstream.is_none()` no longer requires `owner == tenant`, so a community leader manages
	 * shares on a MEMBER's own file - it is still the community's own content, hosted here.
	 */
	it('allows a leader over a member-owned row that originates here', () => {
		expect(canManageShares(file(OTHER), ME, ['leader'])).toBe(true)
		expect(canManageShares(file(TENANT), ME, ['leader'])).toBe(true)
	})

	/*
	 * ...and the other half: leadership is authority over what THIS node hosts, never over a
	 * foreign owner's row that merely sits here as a Pin/Place copy or an FSHR mirror.
	 */
	it('refuses a leader over a mirrored row', () => {
		expect(canManageShares(file(OTHER, OTHER), ME, ['leader'])).toBe(false)
		// Even one we own ourselves - see the record-vs-content split below
		expect(canManageShares(file(ME, OTHER), ME, ['leader'])).toBe(false)
	})

	/*
	 * The owner of a locally originating row, with NO accessLevel on it - the
	 * `GET /files/{id}/metadata` skip path. Nothing but `resolveAccessLevel` recovers this now that
	 * the owner branch is gone from the predicate.
	 */
	it('allows the owner of a local row even when the server sent no level', () => {
		expect(canManageShares(file(ME), ME, [])).toBe(true)
	})

	/*
	 * THE record-vs-content split. A Pin placer / FSHR recipient owns the local RECORD - rename,
	 * move, hide, delete, tag (the ABAC ownership branch, deliberately not upstream-gated) - but the
	 * share set belongs to the node holding the canonical copy.
	 */
	it('refuses the owner of a mirrored row, who still holds record authority', () => {
		const pinned = file(ME, OTHER)
		expect(canManageFile(pinned, ME, [])).toBe(true)
		expect(canManageShares(pinned, ME, [])).toBe(false)
	})

	it('rejects a moderator, who has write but not share management', () => {
		expect(canManageShares(file(TENANT), ME, ['moderator'])).toBe(false)
		expect(canManageShares(file(TENANT), ME, ['contributor'])).toBe(false)
	})

	it('rejects a plain member and an anonymous caller', () => {
		expect(canManageShares(file(TENANT), ME, [])).toBe(false)
		expect(canManageShares(file(TENANT), undefined, [])).toBe(false)
	})

	// The roles argument is load-bearing: the predicate cannot tell which node they came from, so
	// the CALLER must pass the ones held on the node that will serve the request. The active
	// context's roles for a file served elsewhere open the full share UI and then 403.
	it('grants nothing of its own on a mirrored file - the caller owns the roles argument', () => {
		expect(canManageShares(file(OTHER, OTHER), ME, [])).toBe(false)
	})

	/*
	 * Backend gate 0: `is_share_manager` returns false on `access == AccessLevel::None` BEFORE the
	 * leader test (cloudillo-rs crates/cloudillo-core/src/share_access.rs:75). Reachability is not
	 * something leadership can substitute for; without this gate the predicate offers "Share…" on a
	 * row the server would refuse outright.
	 */
	it('rejects an unreachable row whatever the standing', () => {
		const unreachable = { ...file(ME), accessLevel: 'none' as const }
		expect(canManageShares(unreachable, ME, [])).toBe(false)
		expect(canManageShares(unreachable, ME, ['leader'])).toBe(false)
	})

	/*
	 * The 'A' grant, which the backend resolves into the access level itself
	 * (`AccessLevel::from_perm_char('A') == Admin`) and reports on every `GET /api/files` row. It is
	 * the only standing that reaches ACROSS the mirror.
	 */
	it("recognises an 'A' grantee on a mirrored row", () => {
		const granted = { ...file(OTHER, OTHER), accessLevel: 'admin' as const }
		expect(canManageShares(granted, ME, [])).toBe(true)
		// A plain write grant on the same row still confers nothing.
		expect(canManageShares({ ...granted, accessLevel: 'write' }, ME, [])).toBe(false)
	})

	/*
	 * Why `hasAdminGrant` survives: `deriveFileOwnerScope` (utils.ts) hands mirrored rows to this
	 * predicate with `accessLevel: undefined`, because the ACTIVE context's cached level is not the
	 * UPSTREAM node's answer. The 'admin' branch above is therefore invisible there, and the
	 * ShareDialog's `hasAdminGrant` fallback is the only thing that recovers the grant.
	 */
	it('cannot see an admin grant once the cross-context scope has stripped the level', () => {
		const stripped = { ...file(OTHER, OTHER), accessLevel: undefined }
		expect(canManageShares(stripped, ME, [])).toBe(false)
		expect(hasAdminGrant([{ subjectType: 'U', subjectId: ME, permission: 'A' }], ME)).toBe(true)
	})
})

/*
 * Mirrors `grant_ceiling` (cloudillo-rs crates/cloudillo-core/src/share_access.rs:121): being a
 * share MANAGER says nothing about how much access one may hand out. `ensure_grant_within` caps
 * every mint and widen at the caller's own level.
 */
describe('shareGrantCeiling / linkGrantCeiling', () => {
	it('gives the owner of a local row everything', () => {
		expect(shareGrantCeiling(file(ME), ME, [])).toBe('admin')
		// ...capped into the link vocabulary, which has no admin
		expect(linkGrantCeiling(file(ME), ME, [])).toBe('WRITE')
	})

	it('gives a leader everything over a row that originates here', () => {
		expect(shareGrantCeiling(file(TENANT), ME, ['leader'])).toBe('admin')
		// ...including a member's own file - the same widening canManageShares got
		expect(shareGrantCeiling(file(OTHER), ME, ['leader'])).toBe('admin')
	})

	// The other half of `leader_over_local_row`: over a mirrored row a leader is judged on their
	// own access alone, exactly as `grant_ceiling(access, false)` does.
	it('falls back to the row`s own level for a leader over a mirrored row', () => {
		const pinned = { ...file(OTHER, OTHER), accessLevel: 'comment' as const }
		expect(shareGrantCeiling(pinned, ME, ['leader'])).toBe('comment')
		expect(linkGrantCeiling(pinned, ME, ['leader'])).toBe('COMMENT')
	})

	// THE case the ceiling exists for: a Read-level share manager may not mint a write grant and
	// redeem it. On a local row the server's own level still caps the ladder.
	it('caps a Read-level caller at read', () => {
		const f = { ...file(TENANT, OTHER), accessLevel: 'read' as const }
		expect(shareGrantCeiling(f, ME, [])).toBe('read')
		expect(linkGrantCeiling(f, ME, [])).toBe('READ')
	})

	/*
	 * An absent level means "not computed", not "no access": `deriveFileOwnerScope` strips it on
	 * mirrored rows. Guessing low there would grey out the menu for a legitimate manager, so the
	 * fallback is unrestricted and the SERVER stays the enforcer - its refusal is what
	 * `shareLinkErrorMessage` explains.
	 */
	it('is unrestricted when the level is unknown', () => {
		expect(shareGrantCeiling(file(OTHER, OTHER), ME, [])).toBe('admin')
		expect(linkGrantCeiling(file(OTHER, OTHER), ME, [])).toBe('WRITE')
	})

	it('reports the levels a ceiling forbids', () => {
		expect(levelsAboveCeiling('READ')).toEqual(['COMMENT', 'WRITE'])
		expect(levelsAboveCeiling('COMMENT')).toEqual(['WRITE'])
		expect(levelsAboveCeiling('WRITE')).toEqual([])
	})
})

// canManageFile is the ABAC ownership branch for `file:update|delete|write`
// (crates/cloudillo-core/src/abac.rs:615-635), deliberately NOT upstream-gated, plus plain write
// access. It is looser than canManageShares in one direction and stricter in another.
describe('canManageFile vs canManageShares', () => {
	it('lets a moderator manage but not re-share a community file', () => {
		const f = file(TENANT)
		expect(canManageFile(f, ME, ['moderator'])).toBe(true)
		expect(canManageShares(f, ME, ['moderator'])).toBe(false)
	})

	/*
	 * The old predicate short-circuited to `true` on an "ownerless" row, so every plain member got
	 * Rename, the Visibility dropdown and editable Tags on every community file - all three 403.
	 * There is no ownerless row any more, and no short-circuit.
	 */
	it('refuses a community row to a plain member', () => {
		expect(canManageFile(file(TENANT), ME, [])).toBe(false)
	})

	// Both are judged against the SCOPE - the node in `api` - not the active context. The roles
	// argument is the only thing that carries that, so a moderator role held on the wrong node must
	// never be passed here; useFileOwnerScope is what gets it right.
	it('judges canManageFile against the scope roles it is handed', () => {
		const local = file(OTHER)
		expect(canManageFile(local, ME, ['moderator'])).toBe(true)
		expect(canManageFile(local, ME, [])).toBe(false)
	})

	// ...and roles say nothing at all about a mirrored row, whose level the upstream node owns.
	it('grants nothing from roles on a mirrored row', () => {
		expect(canManageFile(file(OTHER, OTHER), ME, ['leader'])).toBe(false)
		// A real grant from that node does carry through
		expect(canManageFile({ ...file(OTHER, OTHER), accessLevel: 'write' }, ME, [])).toBe(true)
	})
})

/*
 * The single most important consequence of the swap: on a community, a MEMBER's own file has
 * `owner = member ≠ context`. Every old `owner?.idTag !== contextIdTag` test read that as
 * cross-context - stripping accessLevel, firing a proxy-token probe at the member's node and
 * building a resId with the wrong owner half. `upstream` is the only provenance signal.
 */
describe('a member-owned row on a community', () => {
	const memberFile = file(OTHER)

	it('is judged by the community`s own roles, not treated as foreign', () => {
		expect(canManageFile(memberFile, ME, ['moderator'])).toBe(true)
		expect(canManageShares(memberFile, ME, ['leader'])).toBe(true)
		expect(shareGrantCeiling(memberFile, ME, ['leader'])).toBe('admin')
	})

	it('is refused to a caller with no standing on that community', () => {
		expect(canManageFile(memberFile, ME, [])).toBe(false)
		expect(canManageShares(memberFile, ME, [])).toBe(false)
	})
})

/*
 * ContextMenu approximates useFileOwnerScope without mounting it (the hook fetches a proxy token
 * per file, which the menu will not do on every right-click). The hook strips `accessLevel` on a
 * mirrored row because the ACTIVE context's cached level is not the upstream node's answer — and
 * once `accessLevel: 'admin'` started arriving on ordinary rows, a menu that skipped the strip
 * offered "Share…" on a pinned copy, then opened a dialog that refused it.
 */
describe('ContextMenu`s mirrored-row accessLevel strip', () => {
	it('needs the local `admin` level stripped before it agrees with the dialog', () => {
		const pinned = { ...file(OTHER, OTHER), accessLevel: 'admin' as const }
		// What the menu would conclude passing the row raw
		expect(canManageShares(pinned, ME, [])).toBe(true)
		// What it concludes now, matching deriveFileOwnerScope and therefore the dialog
		expect(canManageShares({ ...pinned, accessLevel: undefined }, ME, [])).toBe(false)
	})
})

// Mirrors the backend `is_share_reader`: write access is enough to ENUMERATE a file's shares, even
// though changing them needs the manager standing above.
describe('canReadShares', () => {
	function withAccess(f: File, accessLevel: File['accessLevel']): File {
		return { ...f, accessLevel }
	}

	it('passes anyone who can manage the shares', () => {
		expect(canReadShares(file(ME), ME, [])).toBe(true)
	})

	it('passes a `W` grantee on a mirrored row who cannot manage them', () => {
		const f = withAccess(file(OTHER, OTHER), 'write')
		expect(canManageShares(f, ME, [])).toBe(false)
		expect(canReadShares(f, ME, [])).toBe(true)
	})

	it('rejects a read-only grantee', () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'read'), ME, [])).toBe(false)
	})

	// 'admin' outranks 'write', so it passes twice over: canManageShares admits it outright, and
	// the canWrite() fallback would too.
	it("passes an 'A' grantee", () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'admin'), ME, [])).toBe(true)
	})

	// `is_share_reader` requires Write, not Read (share_access.rs:88) - comment access is not enough
	// to enumerate, and 'none' is refused by canManageShares' gate 0 as well.
	it('rejects comment and unreachable access', () => {
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'comment'), ME, [])).toBe(false)
		expect(canReadShares(withAccess(file(OTHER, OTHER), 'none'), ME, [])).toBe(false)
		// ...even for the owner, since gate 0 fires ahead of everything
		expect(canReadShares(withAccess(file(ME), 'none'), ME, ['leader'])).toBe(false)
	})

	// Record authority, the same rung canManageFile keeps: the placer of a Pin row may SEE who
	// their own copy is shared with even though resolveAccessLevel holds no content answer for a
	// mirrored row. Managing those shares is still the upstream node's call.
	it('passes the owner of a mirrored row it was sent no level for', () => {
		const f = file(ME, OTHER)
		expect(resolveAccessLevel(f, ME, [])).toBeUndefined()
		expect(canManageShares(f, ME, [])).toBe(false)
		expect(canReadShares(f, ME, [])).toBe(true)
	})

	// `compute_file_access_levels` fills accessLevel on every list row; it is absent only on rows the
	// shell built itself and on metadata responses, where `resolveAccessLevel`'s ladder fills it in.
	it('falls back to the role ladder when accessLevel is absent', () => {
		expect(canReadShares(file(TENANT), ME, ['moderator'])).toBe(true)
		expect(canReadShares(file(TENANT), ME, [])).toBe(false)
		expect(canReadShares(file(OTHER, OTHER), ME, [])).toBe(false)
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
 * The cross-context fallback: `deriveFileOwnerScope` strips `accessLevel` on mirrored rows, so
 * `canManageShares`' 'admin' branch cannot fire there. This recovers the grant from entries the
 * caller has already fetched — ShareDialog is the only place that has them, which is why a mirrored
 * 'A' grant still reads as a false negative at every entry point before the dialog opens.
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

	// An absent level means "not computed", not "no access" — `resolveAccessLevel` is what fills it
	// in where it legitimately can.
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

/**
 * The POST vocabulary (`Visibility` in `shell/src/apps/feed/VisibilitySelector.tsx`) is a
 * subset of the FILE ladder, and `ComposePanel` compares a document's visibility against a
 * post's on this one function. Nothing in the type system pins the two together, so this does.
 */
describe('visibilityRank', () => {
	it.each(['P', 'C', 'F'])('places the post visibility %s on the file ladder', (v) => {
		expect(visibilityRank(v)).toBeGreaterThanOrEqual(0)
	})

	it('orders public above followers above connected above direct', () => {
		expect(visibilityRank('P')).toBeGreaterThan(visibilityRank('F'))
		expect(visibilityRank('F')).toBeGreaterThan(visibilityRank('C'))
		expect(visibilityRank('C')).toBeGreaterThan(visibilityRank(null))
	})

	it("normalises 'D' onto the same rung as null", () => {
		expect(visibilityRank('D')).toBe(visibilityRank(null))
	})

	it.each([undefined, 'X'])('refuses to place %s', (v) => {
		expect(visibilityRank(v)).toBe(-1)
	})
})

// vim: ts=4
