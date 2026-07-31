// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ShareEntry } from '@cloudillo/core'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import type { IconType } from 'react-icons'
import {
	LuUserCheck as IcConnected,
	LuLock as IcDirect,
	LuUserPlus as IcFollowers,
	LuGlobe as IcPublic,
	LuShieldCheck as IcVerified
} from 'react-icons/lu'

import type { File, FileVisibility } from './types.js'

/**
 * Format a date/timestamp as a relative time string
 */
export function formatRelativeTime(dateInput: string | number): string {
	try {
		// Handle Unix timestamp (seconds) - if it's a number or looks like one
		let d: Date
		if (typeof dateInput === 'number') {
			// Unix timestamp in seconds
			d = new Date(dateInput * 1000)
		} else if (/^\d+$/.test(dateInput)) {
			// String that looks like a Unix timestamp
			d = new Date(parseInt(dateInput, 10) * 1000)
		} else {
			// ISO string or other date format
			d = new Date(dateInput)
		}

		// Check for invalid date
		if (Number.isNaN(d.getTime())) return ''

		const now = new Date()
		const deltaSec = (now.getTime() - d.getTime()) / 1000

		if (deltaSec < 0) return dayjs(d).format('MMM D') // Future date
		if (deltaSec < 60) return 'just now'
		if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
		if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
		if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)}d ago`
		if (now.getFullYear() === d.getFullYear()) {
			return dayjs(d).format('MMM D')
		}
		return dayjs(d).format('MMM D, YYYY')
	} catch {
		return ''
	}
}

/**
 * Smart timestamp result with optional label
 */
export interface SmartTimestamp {
	label: string // 'Edited', 'Opened', or ''
	time: string // Relative time string
}

/**
 * Get a smart timestamp that shows the most relevant activity for the file.
 * - If user modified recently (< 7 days), shows "Edited X ago"
 * - If user accessed recently (< 7 days), shows "Opened X ago"
 * - Otherwise shows creation date
 */
export function getSmartTimestamp(file: File): SmartTimestamp {
	const now = Date.now()
	const WEEK_MS = 7 * 24 * 60 * 60 * 1000

	const userModified = file.userData?.modifiedAt
	const userAccessed = file.userData?.accessedAt

	// If user modified recently (< 7 days), show "Edited X ago"
	if (userModified) {
		const modifiedTime = new Date(userModified).getTime()
		if (now - modifiedTime < WEEK_MS) {
			return { label: 'Edited', time: formatRelativeTime(userModified) }
		}
	}

	// If user accessed recently (< 7 days), show "Opened X ago"
	if (userAccessed) {
		const accessedTime = new Date(userAccessed).getTime()
		if (now - accessedTime < WEEK_MS) {
			return { label: 'Opened', time: formatRelativeTime(userAccessed) }
		}
	}

	// Otherwise show created date
	return { label: '', time: formatRelativeTime(file.createdAt) }
}

/**
 * Visibility options configuration (label is already translated)
 */
export interface VisibilityOption {
	value: FileVisibility
	label: string
	icon: IconType
}

// Ordered from most private to most public.
export const getVisibilityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: null, label: t('Direct'), icon: IcDirect },
	{ value: 'D', label: t('Direct'), icon: IcDirect },
	{ value: 'C', label: t('Connected'), icon: IcConnected },
	{ value: 'F', label: t('Followers'), icon: IcFollowers },
	{ value: 'V', label: t('Verified'), icon: IcVerified },
	{ value: 'P', label: t('Public'), icon: IcPublic }
]

/**
 * Get visibility option by value (normalized: null and 'D' both mean Direct)
 */
export function getVisibilityOption(t: TFunction, visibility: FileVisibility): VisibilityOption {
	const normalizedValue = visibility === 'D' ? null : visibility
	const opts = getVisibilityOptions(t)
	return opts.find((opt) => opt.value === normalizedValue) || opts[0]
}

/**
 * Get the translated label for a visibility value
 */
export function getVisibilityLabel(t: TFunction, visibility: FileVisibility): string {
	return getVisibilityOption(t, visibility).label
}

// Icon mapping by visibility value (does not need translation).
const VISIBILITY_ICONS: Record<string, IconType> = {
	null: IcDirect,
	D: IcDirect,
	C: IcConnected,
	F: IcFollowers,
	V: IcVerified,
	P: IcPublic
}

/**
 * Get the icon component for a visibility value
 */
export function getVisibilityIcon(visibility: FileVisibility): IconType {
	const key = visibility === null ? 'null' : visibility
	return VISIBILITY_ICONS[key] || IcDirect
}

/**
 * Visibility options for dropdown (excludes duplicate 'D' since null is the same)
 */
export const getVisibilityDropdownOptions = (t: TFunction): VisibilityOption[] =>
	getVisibilityOptions(t).filter((opt) => opt.value !== 'D')

/** Access levels the share UI can express, as stored on `ShareEntry.permission`. */
export type SharePermLevel = 'READ' | 'COMMENT' | 'WRITE'

/** The whole `share_entries.permission` vocabulary, admin included. */
export type SharePermChar = 'R' | 'C' | 'W' | 'A'

/** A file's resolved access level, as `File.accessLevel` reports it.
 *  `'admin'` is write PLUS the right to manage the file's share set. */
export type FileAccessLevel = 'none' | 'read' | 'comment' | 'write' | 'admin'

/**
 * Normalize a raw wire permission into a {@link SharePermChar}.
 *
 * Unknown input reads as `'R'`, mirroring the backend's fail-safe
 * `AccessLevel::from_perm_char`. `tShareEntry.permission` stays `T.string` precisely so one
 * corrupt row degrades to "viewer" here instead of failing the decode of the whole share list.
 */
export function toSharePermChar(raw: unknown): SharePermChar {
	const c = typeof raw === 'string' ? raw : raw?.toString()
	return c === 'A' || c === 'W' || c === 'C' ? c : 'R'
}

/**
 * Write-or-better. The single comparison for "may this user change the file".
 *
 * Always use this instead of `accessLevel === 'write'`: the file's owner, a community leader and
 * an explicit `'A'` grantee all resolve to `'admin'`, and an equality test locks every one of
 * them out.
 */
export function canWrite(level: FileAccessLevel | undefined): boolean {
	return level === 'write' || level === 'admin'
}

/**
 * The level to hand a sandboxed app.
 *
 * Apps get a 3-valued vocabulary (`libs/core/src/message-bus`): `'admin'` caps to `'write'`
 * because an app cannot manage a share set, and `'none'` reads as `'read'` because a file the
 * shell has already opened is at least readable.
 */
export function toAppAccess(level: FileAccessLevel | undefined): 'read' | 'comment' | 'write' {
	if (canWrite(level)) return 'write'
	return level === 'comment' ? 'comment' : 'read'
}

/** A share link's access level as the permission vocabulary the read-only badge labels with.
 *  Links never carry admin — the backend rejects `'admin'` on refs. */
export function linkAccessToPermLevel(
	access: 'read' | 'comment' | 'write' | undefined
): SharePermLevel {
	if (access === 'write') return 'WRITE'
	if (access === 'comment') return 'COMMENT'
	return 'READ'
}

/** The editable levels' wire chars. `'A'` is deliberately absent — see {@link isAdminPerm}. */
export function levelToPermChar(level: SharePermLevel): SharePermChar {
	if (level === 'WRITE') return 'W'
	if (level === 'COMMENT') return 'C'
	return 'R'
}

/**
 * Whether a raw `ShareEntry.permission` char is the admin standing.
 *
 * `'A'` confers share management server-side (`is_share_manager`), but the UI can neither grant
 * nor express it — the level menu is 3-valued by design. Treat such entries as read-only:
 * folding `'A'` into `'WRITE'` would let a level toggle silently overwrite the grant with `'W'`,
 * and nothing in this UI could restore it.
 */
export function isAdminPerm(perm: unknown): boolean {
	return perm === 'A'
}

/**
 * Whether the signed-in user holds an explicit `'A'` (admin) share grant on this file.
 *
 * A partial recovery of the grant on a CROSS-OWNER row, where {@link deriveFileOwnerScope} strips
 * `accessLevel`. It costs nothing extra — it reads entries the ShareDialog has already fetched — but
 * it scans only THIS file's own `'U'` entries, so an `'A'` inherited from a parent folder is
 * invisible to it. `api.files.getMetadata` is the complete answer: the serving node computes
 * `accessLevel` itself and folds in inherited grants.
 */
export function hasAdminGrant(
	entries: Pick<ShareEntry, 'subjectType' | 'subjectId' | 'permission'>[] | undefined,
	authIdTag: string | undefined
): boolean {
	if (!authIdTag || !entries) return false
	return entries.some(
		(e) =>
			e.subjectType === 'U' &&
			e.subjectId.toString() === authIdTag &&
			isAdminPerm(e.permission)
	)
}

/** Map a raw permission char to an editable level. `'A'` is not one — callers
 *  must branch on {@link isAdminPerm} first, or the admin badge turns into a
 *  "Viewer" menu that overwrites the grant on its first change. */
export function permCharToLevel(perm: string): SharePermLevel {
	if (perm === 'W') return 'WRITE'
	if (perm === 'C') return 'COMMENT'
	return 'READ'
}

/** Human label for a raw permission char, including the admin standing. */
export function sharePermLabel(perm: string, t: TFunction): string {
	if (isAdminPerm(perm)) return t('Admin')
	const level = permCharToLevel(perm)
	return level === 'WRITE' ? t('Editor') : level === 'COMMENT' ? t('Commenter') : t('Viewer')
}

/** Badge variant for a raw permission char. Paired with {@link sharePermLabel} so the two never
 *  drift: admin gets its own colour, since on 'accent' it read as an ordinary editor grant. */
export function sharePermVariant(perm: string): 'warning' | 'accent' | 'primary' | 'secondary' {
	if (isAdminPerm(perm)) return 'warning'
	const level = permCharToLevel(perm)
	return level === 'WRITE' ? 'accent' : level === 'COMMENT' ? 'primary' : 'secondary'
}

/**
 * The subset of a file the permission predicates below actually read. Kept structural so callers
 * holding a core `FileView` (whose `createdAt` may be a `Date`) can pass it without a cast.
 */
export type FileOwnership = Pick<File, 'owner' | 'creator'>

/**
 * Check if the current user can manage a file (change visibility, sharing, etc.)
 *
 * A user can manage a file if:
 * - They are the file owner (for shared files with explicit owner_tag)
 * - They have leader or moderator role in the current context (for tenant-owned files)
 */
export function canManageFile(
	file: FileOwnership,
	authIdTag: string | undefined,
	contextRoles: string[]
): boolean {
	// Tenant-owned files (no explicit owner) can be managed by the context user
	if (!file.owner?.idTag) return true
	// File owner can always manage (for shared files with explicit owner)
	if (file.owner.idTag === authIdTag) return true
	// Leader/moderator roles can manage in community context
	if (contextRoles.some((r) => r === 'leader' || r === 'moderator')) return true
	return false
}

/**
 * Check if the current user can create, change or revoke shares on a file.
 *
 * Deliberately stricter than {@link canManageFile}: the backend's `is_share_manager`
 * (crates/cloudillo-core/src/share_access.rs) requires ownership standing, not merely write access,
 * so a moderator who did not create the file — and a plain `W` grantee — can rename or delete it but
 * cannot re-share it. An ownerless (tenant-owned) file is manageable only by its creator or a
 * context leader, unlike `canManageFile` where the whole context qualifies.
 *
 * The `leader` branch fires only on a TENANT-OWNED row: the backend's
 * `leader_over_tenant_row = is_leader(roles) && owner_id_tag == tenant_id_tag`. Leadership is
 * authority over the tenant's own content, never over a foreign owner's row that merely sits here as
 * a Pin/Place copy. Callers must still pass the roles they hold on the node that SERVES the row —
 * what `useFileOwnerScope` derives — and `contextIdTag` names that node, so both the leader and the
 * creator branch need it.
 *
 * The `'A'` (admin) grant reaches us as `accessLevel === 'admin'` on SAME-OWNER rows only; on
 * cross-owner ones {@link deriveFileOwnerScope} strips `accessLevel`. Two things recover it:
 * {@link hasAdminGrant}, which sees only this file's OWN `'U'` entries and is therefore blind to a
 * grant inherited from a parent folder, and `api.files.getMetadata`, which asks the serving node for
 * its own computed `accessLevel` and sees both. Entry points before the ShareDialog read a
 * cross-owner admin grant as a false negative rather than pay a probe per selection.
 */
export function canManageShares(
	file: ScopedFile,
	authIdTag: string | undefined,
	contextIdTag: string | undefined,
	contextRoles: string[]
): boolean {
	// Backend gate 0: is_share_manager rejects on access == None ahead of every standing test
	// (cloudillo-rs crates/cloudillo-core/src/share_access.rs). Leadership and ownership never
	// substitute for reachability.
	if (file.accessLevel === 'none') return false
	// The explicit 'A' grant, resolved server-side into the level itself. Owner and leader also
	// land here, but keep their own branches: `deriveFileOwnerScope` clears `accessLevel` on
	// cross-owner rows, where those two still hold.
	if (file.accessLevel === 'admin') return true
	if (authIdTag && file.owner?.idTag === authIdTag) return true
	// `owner == tenant` in backend terms; the ownerless case is the same thing, back-filled by the
	// meta adapter's `effective_owner`. Leadership is authority over the tenant's OWN content, never
	// over a foreign owner's row that merely sits here (Pin/Place). Same boundary
	// `file_access::role_access_level` draws.
	const tenantOwned = !file.owner?.idTag || file.owner.idTag === contextIdTag
	if (!tenantOwned) return false
	if (contextRoles.includes('leader')) return true
	if (authIdTag && file.creator?.idTag === authIdTag) return true
	return false
}

/**
 * Highest level this caller may hand out on `file`. Mirrors the backend's `grant_ceiling`
 * (crates/cloudillo-core/src/share_access.rs): ownership-derived standing is already Admin;
 * everyone else is capped at what they hold, which is what stops the `Read`-level creator of a
 * tenant-owned file — a share manager by the creator rule — from minting a `write` grant.
 *
 * The `?? 'admin'` fallback is deliberate: {@link deriveFileOwnerScope} strips `accessLevel` on
 * cross-owner rows, and restricting the menu on a guess would lock out a legitimate manager. The
 * server still enforces the real ceiling, and `shareLinkErrorMessage` explains the refusal.
 */
export function shareGrantCeiling(
	file: ScopedFile,
	authIdTag: string | undefined,
	contextIdTag: string | undefined,
	contextRoles: string[]
): FileAccessLevel {
	if (authIdTag && file.owner?.idTag === authIdTag) return 'admin'
	const tenantOwned = !file.owner?.idTag || file.owner.idTag === contextIdTag
	if (tenantOwned && contextRoles.includes('leader')) return 'admin'
	return file.accessLevel ?? 'admin'
}

/** The same ceiling in the 3-valued link vocabulary — a link never carries admin. */
export function linkGrantCeiling(
	file: ScopedFile,
	authIdTag: string | undefined,
	contextIdTag: string | undefined,
	contextRoles: string[]
): SharePermLevel {
	const ceiling = shareGrantCeiling(file, authIdTag, contextIdTag, contextRoles)
	if (ceiling === 'admin' || ceiling === 'write') return 'WRITE'
	if (ceiling === 'comment') return 'COMMENT'
	return 'READ'
}

/** The editable levels a ceiling forbids — feeds AccessLevelMenu's `disabledLevels`. */
export function levelsAboveCeiling(ceiling: SharePermLevel): SharePermLevel[] {
	if (ceiling === 'WRITE') return []
	if (ceiling === 'COMMENT') return ['WRITE']
	return ['COMMENT', 'WRITE']
}

/**
 * Mirrors the backend `is_share_reader` (crates/cloudillo-core/src/share_access.rs): any caller with
 * Write access may ENUMERATE a file's share entries, even though only a share manager may change
 * them.
 * Kept separate from {@link canManageShares} so a moderator sees who a file is shared with instead
 * of being told they cannot share it.
 *
 * `compute_file_access_levels` (crates/cloudillo-file/src/filter.rs) fills `accessLevel` on EVERY
 * `GET /api/files` row, so the {@link canManageFile} fallback below only applies to `File` objects
 * the shell built itself and to `GET /api/files/{id}/metadata` responses, where the backend
 * deliberately skips the computation for same-tenant callers.
 */
export function canReadShares(
	file: ScopedFile,
	authIdTag: string | undefined,
	contextIdTag: string | undefined,
	contextRoles: string[]
): boolean {
	if (canManageShares(file, authIdTag, contextIdTag, contextRoles)) return true
	if (file.accessLevel !== undefined) return canWrite(file.accessLevel)
	return canManageFile(file, authIdTag, contextRoles)
}

/** How far useFileOwnerScope's lookup of the owner's node has got */
export type OwnerLookupStatus = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * Whether the owner lookup has produced an answer. 'idle' means it has not even started, which is
 * the state the very first render sees - counting that as an answer makes the ShareDialog paint
 * "could not reach the server" for a frame.
 */
export function isOwnerSettled(status: OwnerLookupStatus): boolean {
	return status === 'ready' || status === 'failed'
}

/** What the scope reads off a file: ownership plus the remote-browsing access level */
export type ScopedFile = FileOwnership & Pick<File, 'accessLevel'>

/** An already-decided node's tenant and the roles held there - see `FileOwnerScopeOverride` */
export interface FileOwnerScopeOverrideInput {
	idTag: string | undefined
	roles: string[]
	/**
	 * The caller has decided WHICH node but has not got its client yet. Keeping the override present
	 * while its token is in flight is what keeps the row judged against that node instead of
	 * silently falling back to the active context.
	 */
	resolving?: boolean
}

/**
 * Whether a row belongs to a tenant other than the active context - the one flag both this module
 * and `useFileOwnerScope`'s effect branch on, so it lives in one place. An override names the node
 * outright (remote browsing); without one, a foreign-owned file needs its own proxy token before
 * anything can be said about our standing there.
 */
export function isCrossOwnerFile(
	ownerIdTag: string | undefined,
	contextIdTag: string | undefined,
	hasOverride: boolean
): boolean {
	return !hasOverride && !!ownerIdTag && !!contextIdTag && ownerIdTag !== contextIdTag
}

/**
 * An ownerless row belongs to whichever tenant served it. Name that tenant explicitly unless it is
 * us, so `canManageFile`'s ownerless short-circuit cannot vouch for a node we hold no roles on.
 * Cross-owner rows already name their owner, so this is a no-op for them.
 */
export function scopeFileToTenant(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeIdTag: string | undefined
): ScopedFile {
	if (file.owner?.idTag || !scopeIdTag || scopeIdTag === authIdTag) return file
	return { ...file, owner: { idTag: scopeIdTag } }
}

export interface FileOwnerScopeInput {
	file: ScopedFile
	authIdTag: string | undefined
	/** The active context, i.e. the node currently being browsed */
	contextIdTag: string | undefined
	/** How far the proxy-token lookup for a cross-owner file has got */
	ownerStatus: OwnerLookupStatus
	/** Roles the proxy token reported on the OWNER's node. Empty until it lands. */
	ownerRoles: string[]
	/** Roles held on the active context */
	contextRoles: string[]
	/** When present, the caller has already decided the node, so no owner lookup happens at all */
	override?: FileOwnerScopeOverrideInput
}

export interface FileOwnerScopeDerivation {
	isCrossOwner: boolean
	/** Owner known but the active context is not: grant nothing and point at no node */
	scopeUnresolved: boolean
	ownerIdTag: string | undefined
	scopeIdTag: string | undefined
	scopeRoles: string[]
	/** `file`, with an ownerless row back-filled to the scope tenant. What the predicates judge. */
	scopedFile: ScopedFile
	/** {@link shareGrantCeiling} for this scope — the highest level any share or link may carry */
	grantCeiling: FileAccessLevel
	canManageShares: boolean
	canReadShares: boolean
	canManageFile: boolean
	resolving: boolean
}

/**
 * Everything `useFileOwnerScope` decides that is not an effect. Lifted out of the hook so the rules
 * can be tested without a React renderer (`shell` has no `@testing-library/react`); the hook keeps
 * the token fetch and delegates every derivation here.
 *
 * THE rule: a cross-owner file's standing comes from the OWNER's node, never from the active
 * context, and while that answer is missing or refused nothing is granted. Falling back to
 * `contextIdTag`/`contextRoles` in either case re-introduces the cross-tenant role leak.
 */
export function deriveFileOwnerScope({
	file,
	authIdTag,
	contextIdTag,
	ownerStatus,
	ownerRoles,
	contextRoles,
	override
}: FileOwnerScopeInput): FileOwnerScopeDerivation {
	const ownerIdTag = file.owner?.idTag
	// An override that names no tenant decides nothing: with no scopeIdTag the back-fill below is
	// skipped, and canManageFile's ownerless short-circuit would vouch for a node we cannot name.
	const scopeUnresolved = override ? !override.idTag : !!ownerIdTag && !contextIdTag
	const isCrossOwner = isCrossOwnerFile(ownerIdTag, contextIdTag, !!override)

	const scopeIdTag = isCrossOwner ? ownerIdTag : override ? override.idTag : contextIdTag
	const scopeRoles = isCrossOwner ? ownerRoles : override ? override.roles : contextRoles

	// Cross-owner: `accessLevel` is the ACTIVE context's answer about a row the OWNER's node
	// decides, so it cannot vouch for standing there. Otherwise name the serving tenant.
	const scopedFile: ScopedFile = isCrossOwner
		? { ...file, accessLevel: undefined }
		: scopeFileToTenant(file, authIdTag, scopeIdTag)

	return {
		isCrossOwner,
		scopeUnresolved,
		ownerIdTag,
		scopeIdTag,
		scopeRoles,
		scopedFile,
		grantCeiling: shareGrantCeiling(scopedFile, authIdTag, scopeIdTag, scopeRoles),
		canManageShares:
			!scopeUnresolved && canManageShares(scopedFile, authIdTag, scopeIdTag, scopeRoles),
		canReadShares:
			!scopeUnresolved && canReadShares(scopedFile, authIdTag, scopeIdTag, scopeRoles),
		canManageFile: !scopeUnresolved && canManageFile(scopedFile, authIdTag, scopeRoles),
		// `status` is still 'idle' on the render where isCrossOwner first becomes true, so both
		// states count as "not settled". An override says so for itself.
		resolving:
			scopeUnresolved ||
			!!override?.resolving ||
			(isCrossOwner && !isOwnerSettled(ownerStatus))
	}
}

// vim: ts=4
