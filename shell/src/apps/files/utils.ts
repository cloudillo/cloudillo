// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ShareEntry, SharePermission } from '@cloudillo/core'
import { IcConnection, IcFollowers, IcPublic } from '@cloudillo/react'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import type { IconType } from 'react-icons'

import { IcCommunityMap, IcDirect, IcFeed, IcVerified } from '../../icons.js'
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
	{ value: 'direct', label: t('Direct'), icon: IcDirect },
	{ value: 'subscribed', label: t('Subscribers'), icon: IcFeed },
	{ value: 'connected', label: t('Connected'), icon: IcConnection },
	{ value: 'followers', label: t('Followers'), icon: IcFollowers },
	{ value: 'secondDegree', label: t('Second degree'), icon: IcCommunityMap },
	{ value: 'verified', label: t('Verified'), icon: IcVerified },
	{ value: 'public', label: t('Public'), icon: IcPublic }
]

/**
 * The backend ladder (`VisibilityLevel` in cloudillo-rs `abac.rs`), most private first. Same
 * rungs, same order as `getVisibilityOptions` and `VISIBILITY_ICONS` — keep all three in step.
 */
const VISIBILITY_ORDER: FileVisibility[] = [
	'direct',
	'subscribed',
	'connected',
	'followers',
	'secondDegree',
	'verified',
	'public'
]

// The app↔shell bus (`Visibility` in @cloudillo/core) still speaks visibility chars.
const VISIBILITY_CHARS: Record<string, FileVisibility> = {
	D: 'direct',
	C: 'connected',
	F: 'followers',
	V: 'verified',
	P: 'public'
}

/** File visibility word for a visibility char; an unrecognised char reads as `'direct'`. */
export function fileVisibilityFromChar(c: string | undefined): FileVisibility {
	return (c && VISIBILITY_CHARS[c]) || 'direct'
}

// The subset of the ladder the bus can express.
const BUS_CHARS: Partial<Record<string, 'P' | 'C' | 'F'>> = {
	public: 'P',
	connected: 'C',
	followers: 'F'
}

/** Bus visibility char for a file visibility word; `undefined` where the bus has no such level. */
export function busVisibility(v: string | undefined): 'P' | 'C' | 'F' | undefined {
	return v === undefined || !Object.hasOwn(BUS_CHARS, v) ? undefined : BUS_CHARS[v]
}

/**
 * Where a visibility sits on that ladder. `-1` for `undefined` or anything unrecognised — a
 * value we cannot place must never read as "most private".
 *
 * The POST vocabulary (`Visibility` in `shell/src/apps/feed/VisibilitySelector.tsx`) is a
 * SUBSET of this file ladder, and `ComposePanel` compares a document's visibility against a
 * post's on it. A new post visibility must therefore be added to `VISIBILITY_ORDER` too, or
 * it ranks `-1` and the access notice silently stops firing.
 */
export function visibilityRank(v: string | null | undefined): number {
	if (v == null) return -1
	return VISIBILITY_ORDER.indexOf(v as FileVisibility)
}

/** Only `'unknown'` (newer-node) falls back to Direct: never show more exposure than we know. */
export function getVisibilityOption(
	t: TFunction,
	visibility: FileVisibility | 'unknown'
): VisibilityOption {
	const opts = getVisibilityOptions(t)
	return opts.find((opt) => opt.value === visibility) || opts[0]
}

/**
 * Get the translated label for a visibility value
 */
export function getVisibilityLabel(t: TFunction, visibility: FileVisibility | 'unknown'): string {
	return getVisibilityOption(t, visibility).label
}

// Icon mapping by visibility value (does not need translation).
const VISIBILITY_ICONS: Partial<Record<FileVisibility, IconType>> = {
	direct: IcDirect,
	subscribed: IcFeed,
	connected: IcConnection,
	followers: IcFollowers,
	secondDegree: IcCommunityMap,
	verified: IcVerified,
	public: IcPublic
}

/**
 * Get the icon component for a visibility value
 */
export function getVisibilityIcon(visibility: FileVisibility | 'unknown'): IconType {
	return (visibility !== 'unknown' && VISIBILITY_ICONS[visibility]) || IcDirect
}

/**
 * Visibility options for the dropdown: the settable rungs only. `subscribed` and `secondDegree`
 * are display-only here (set elsewhere or by newer clients).
 */
export const getVisibilityDropdownOptions = (t: TFunction): VisibilityOption[] =>
	getVisibilityOptions(t).filter((o) => o.value !== 'subscribed' && o.value !== 'secondDegree')

/** Access levels the share UI can express, as stored on `ShareEntry.permission`. */
export type SharePermLevel = 'READ' | 'COMMENT' | 'WRITE'

/** The whole `share_entries.permission` vocabulary, admin included. */
export type SharePerm = SharePermission

/** A file's resolved access level, as `File.accessLevel` reports it.
 *  `'admin'` is write PLUS the right to manage the file's share set. `'unknown'` is a level from
 *  a newer node: every predicate below grants it nothing beyond read. */
export type FileAccessLevel = 'none' | 'read' | 'comment' | 'write' | 'admin' | 'unknown'

/**
 * Normalize a raw wire permission into a {@link SharePerm}.
 *
 * Unknown input reads as `'read'`, mirroring the backend's fail-safe
 * `AccessLevel::from_perm_char`. `tShareEntry.permission` stays `T.string` precisely so one
 * corrupt row degrades to "viewer" here instead of failing the decode of the whole share list.
 */
export function toSharePerm(raw: unknown): SharePerm {
	const c = typeof raw === 'string' ? raw : raw?.toString()
	return c === 'admin' || c === 'write' || c === 'comment' ? c : 'read'
}

/**
 * Write-or-better. The single comparison for "may this user change the file".
 *
 * Always use this instead of `accessLevel === 'write'`: the file's owner, a community leader and
 * an explicit `'admin'` grantee all resolve to `'admin'`, and an equality test locks every one of
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
	access: 'read' | 'comment' | 'write' | 'unknown' | undefined
): SharePermLevel {
	if (access === 'write') return 'WRITE'
	if (access === 'comment') return 'COMMENT'
	return 'READ'
}

/** The editable levels' wire words. `'admin'` is deliberately absent — see {@link isAdminPerm}. */
export function levelToPerm(level: SharePermLevel): SharePerm {
	if (level === 'WRITE') return 'write'
	if (level === 'COMMENT') return 'comment'
	return 'read'
}

/**
 * Whether a raw `ShareEntry.permission` is the admin standing.
 *
 * `'admin'` confers share management server-side (`is_share_manager`), but the UI can neither grant
 * nor express it — the level menu is 3-valued by design. Treat such entries as read-only:
 * folding `'admin'` into `'WRITE'` would let a level toggle silently overwrite the grant with
 * `'write'`, and nothing in this UI could restore it.
 */
export function isAdminPerm(perm: unknown): boolean {
	return perm === 'admin'
}

/**
 * Whether the signed-in user holds an explicit `'admin'` share grant on this file.
 *
 * ShareDialog's fallback when `GET /files/:id/access` is unavailable (loading, error, older node):
 * on a CROSS-OWNER row {@link deriveFileOwnerScope} strips `accessLevel`, and this recovers a direct
 * grant from entries the dialog has already fetched. It scans only THIS file's own `'user'`
 * entries, so an `'admin'` inherited from a parent folder is invisible to it — the access endpoint's `canManage`
 * is the complete answer.
 */
export function hasAdminGrant(
	entries: Pick<ShareEntry, 'subjectType' | 'subjectId' | 'permission'>[] | undefined,
	authIdTag: string | undefined
): boolean {
	if (!authIdTag || !entries) return false
	return entries.some(
		(e) =>
			e.subjectType === 'user' &&
			e.subjectId.toString() === authIdTag &&
			isAdminPerm(e.permission)
	)
}

/** Map a raw permission to an editable level. `'admin'` is not one — callers
 *  must branch on {@link isAdminPerm} first, or the admin badge turns into a
 *  "Viewer" menu that overwrites the grant on its first change. */
export function permToLevel(perm: string): SharePermLevel {
	if (perm === 'write') return 'WRITE'
	if (perm === 'comment') return 'COMMENT'
	return 'READ'
}

/** Human label for a raw permission, including the admin standing. */
export function sharePermLabel(perm: string, t: TFunction): string {
	if (isAdminPerm(perm)) return t('Admin')
	const level = permToLevel(perm)
	return level === 'WRITE' ? t('Editor') : level === 'COMMENT' ? t('Commenter') : t('Viewer')
}

/** Badge variant for a raw permission. Paired with {@link sharePermLabel} so the two never
 *  drift: admin gets its own colour, since on 'accent' it read as an ordinary editor grant. */
export function sharePermVariant(perm: string): 'warning' | 'accent' | 'primary' | 'secondary' {
	if (isAdminPerm(perm)) return 'warning'
	const level = permToLevel(perm)
	return level === 'WRITE' ? 'accent' : level === 'COMMENT' ? 'primary' : 'secondary'
}

/**
 * Authority (`owner`) plus provenance (`upstream`) — what the predicates below read. Kept
 * structural so callers holding a core `FileView` (whose `createdAt` may be a `Date`) can pass it
 * without a cast.
 */
export type FileOwnership = Pick<File, 'owner' | 'upstream'>

/** What the predicates judge: ownership plus the level the serving node reported. */
export type ScopedFile = FileOwnership & Pick<File, 'accessLevel'>

/** A row that originates on the node serving it — the backend's `upstream_tag IS NULL`. */
const isLocalRow = (file: FileOwnership) => !file.upstream?.idTag

/** Mirrors `share_access::leader_over_local_row` (crates/cloudillo-core/src/share_access.rs):
 *  leadership is authority over what THIS node hosts, never over a foreign owner's row that
 *  merely sits here as a Pin/Place copy or an FSHR mirror. */
const leaderOverLocalRow = (file: FileOwnership, scopeRoles: string[]) =>
	isLocalRow(file) && scopeRoles.includes('leader')

/**
 * The level the server would report, filling in the two rungs `GET /files/{id}/metadata` skips for
 * a same-tenant caller on a locally originating row (crates/cloudillo-file/src/handler.rs:2500-2536):
 * `get_access_level`'s owner shortcut and role ladder. Returns the server's own answer whenever it
 * sent one; `undefined` on a mirrored row we have no answer for — a refusal is not a grant.
 *
 * PRECONDITION, and the reason the `accessLevel` shortcut comes first: `file.accessLevel` and
 * `scopeRoles` must both describe the SAME node. The shortcut is deliberate — a node that serves a
 * mirrored row is authoritative about its own copy, which is what the record predicates act on — but
 * it means a row carrying one node's cached level judged against another node's roles reads as a
 * grant. Callers that may hold a foreign answer strip it first: `deriveFileOwnerScope` below and
 * `ContextMenu.tsx` both clear `accessLevel` on cross-context rows.
 */
export function resolveAccessLevel(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): FileAccessLevel | undefined {
	if (file.accessLevel !== undefined) return file.accessLevel
	if (!isLocalRow(file)) return undefined
	if (authIdTag && file.owner?.idTag === authIdTag) return 'admin'
	if (scopeRoles.includes('leader')) return 'admin'
	if (scopeRoles.some((r) => r === 'moderator' || r === 'contributor')) return 'write'
	// `role_access_level` matches these three explicitly — testing "the role slice is non-empty"
	// is what would hand a federated stranger Read.
	if (scopeRoles.some((r) => r === 'public' || r === 'follower' || r === 'supporter'))
		return 'read'
	return undefined
}

/**
 * Whether the current user may rename / move / hide / delete / tag a file.
 *
 * Mirrors the ABAC ownership branch for `file:update|delete|write` (crates/cloudillo-core/src/
 * abac.rs:615-635). Record authority, deliberately NOT upstream-gated: the placer of a Pin row
 * keeps rename/move/hide/delete/tag over their own copy.
 */
export function canManageFile(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): boolean {
	// Not redundant with `resolveAccessLevel`'s owner branch: that one is gated on `isLocalRow`,
	// and record authority over a mirrored copy is exactly what this branch keeps.
	if (authIdTag && file.owner?.idTag === authIdTag) return true
	return canWrite(resolveAccessLevel(file, authIdTag, scopeRoles))
}

/**
 * Check if the current user can create, change or revoke shares on a file.
 *
 * Mirrors `is_share_manager` (crates/cloudillo-core/src/share_access.rs:74-82). The owner test and
 * the creator rule are gone from the backend: the owner of a local row already resolves to
 * `'admin'` through {@link resolveAccessLevel}, and a mirrored row's local owner gets record
 * authority ({@link canManageFile}) but no share management — the record-vs-content split.
 *
 * Callers must pass the roles they hold on the node that SERVES the row — what
 * `useFileOwnerScope` derives — never the active context's when the two differ.
 *
 * The `'admin'` grant reaches us as `accessLevel === 'admin'` on same-node rows only; on
 * cross-owner ones {@link deriveFileOwnerScope} strips `accessLevel`. Two things recover it:
 * {@link hasAdminGrant}, which sees only this file's OWN `'user'` entries and is therefore blind to a
 * grant inherited from a parent folder, and `GET /files/:id/access`, whose `canManage` the serving
 * node computes itself and which sees both. Entry points before the ShareDialog read a
 * cross-owner admin grant as a false negative rather than pay a probe per selection.
 */
export function canManageShares(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): boolean {
	const level = resolveAccessLevel(file, authIdTag, scopeRoles)
	// Backend gate 0: is_share_manager rejects on access == None ahead of every standing test.
	// Leadership never substitutes for reachability.
	if (level === 'none') return false
	return leaderOverLocalRow(file, scopeRoles) || level === 'admin'
}

/**
 * Highest level this caller may hand out on `file`. Mirrors the backend's `grant_ceiling`
 * (crates/cloudillo-core/src/share_access.rs:121).
 *
 * The `?? 'admin'` fallback stays deliberate: on a mirrored row we hold no answer, and restricting
 * the menu on a guess would lock out a legitimate manager. The server still enforces the real
 * ceiling, and `shareLinkErrorMessage` explains the refusal.
 */
export function shareGrantCeiling(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): FileAccessLevel {
	if (leaderOverLocalRow(file, scopeRoles)) return 'admin'
	return resolveAccessLevel(file, authIdTag, scopeRoles) ?? 'admin'
}

/** The same ceiling in the 3-valued link vocabulary — a link never carries admin. */
export function linkGrantCeiling(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): SharePermLevel {
	const ceiling = shareGrantCeiling(file, authIdTag, scopeRoles)
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
 * Mirrors the backend `is_share_reader` (crates/cloudillo-core/src/share_access.rs:88-90) composed
 * with the manager test: any caller with Write access may ENUMERATE a file's share entries, even
 * though only a share manager may change them. Kept separate from {@link canManageShares} so a
 * writer who cannot re-share still sees who a file is shared with.
 */
export function canReadShares(
	file: ScopedFile,
	authIdTag: string | undefined,
	scopeRoles: string[]
): boolean {
	if (canManageShares(file, authIdTag, scopeRoles)) return true
	// An answer, whatever it says, is the serving node's decision about its own copy — including
	// the explicit 'none' that `is_share_manager`'s gate 0 refuses on. Record authority does not
	// overrule it.
	const level = resolveAccessLevel(file, authIdTag, scopeRoles)
	if (level !== undefined) return canWrite(level)
	// No answer at all: the same rung `canManageFile` keeps for a mirrored copy. The placer of a
	// Pin row may SEE who their own copy is shared with even though `resolveAccessLevel` holds no
	// content answer for it. Managing those shares still needs `canManageShares` above.
	return canManageFile(file, authIdTag, scopeRoles)
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
 * Whether a row's canonical copy lives on another node - the one flag this module and
 * `useFileOwnerScope`'s effect branch on, so it lives in one place. An override names the node
 * outright (remote browsing); without one, a mirrored row needs its own proxy token before
 * anything can be said about our standing there.
 */
export function isCrossOwnerFile(upstreamIdTag: string | undefined, hasOverride: boolean): boolean {
	return !hasOverride && !!upstreamIdTag
}

/**
 * The node that SERVES a row — what the `<idTag>` half of a resId must name.
 *
 * `remoteOwner` is only for remote browsing, where the rows on screen come from another
 * node's listing while the active context is still ours: those rows originate there, so
 * they carry no `upstream` and the context fallback would address the wrong node.
 */
export function fileSrcIdTag(
	file: Pick<File, 'upstream'>,
	opts: { remoteOwner?: string | null; contextIdTag?: string; authIdTag?: string }
): string | undefined {
	return file.upstream?.idTag || opts.remoteOwner || opts.contextIdTag || opts.authIdTag
}

export interface FileOwnerScopeInput {
	file: ScopedFile
	authIdTag: string | undefined
	/** The active context, i.e. the node currently being browsed */
	contextIdTag: string | undefined
	/** How far the proxy-token lookup for a mirrored file's upstream node has got */
	ownerStatus: OwnerLookupStatus
	/** Roles the proxy token reported on the UPSTREAM node. Empty until it lands. */
	ownerRoles: string[]
	/** Roles held on the active context */
	contextRoles: string[]
	/** When present, the caller has already decided the node, so no owner lookup happens at all */
	override?: FileOwnerScopeOverrideInput
}

export interface FileOwnerScopeDerivation {
	isCrossOwner: boolean
	/** Upstream known but the active context is not: grant nothing and point at no node */
	scopeUnresolved: boolean
	/** Where the canonical copy lives, when it is not this node */
	upstreamIdTag: string | undefined
	scopeIdTag: string | undefined
	scopeRoles: string[]
	/** `file`, with a mirrored row's `accessLevel` stripped. What the predicates judge. */
	scopedFile: ScopedFile
	/** {@link shareGrantCeiling} for this scope — the highest level any share or link may carry */
	grantCeiling: FileAccessLevel
	canManageShares: boolean
	canReadShares: boolean
	canManageFile: boolean
	resolving: boolean
	/**
	 * Which node to fetch a profile picture blob from for the rows this scope served. The scoped
	 * tenant answered for this file, so it holds the mirrored `vis.pf` of its owner and of every
	 * share recipient — the VIEWER's own node (what ProfilePicture/ProfileCard default to) need
	 * not. Never used to decide permissions, only to address an <img>.
	 */
	profileSrcTag: string | undefined
}

/**
 * Everything `useFileOwnerScope` decides that is not an effect. Lifted out of the hook so the rules
 * can be tested without a React renderer: they live in a `.test.ts` suite, which
 * `shell/jest.config.cjs` runs under `node`, with no DOM. The hook keeps the token fetch and
 * delegates every derivation here.
 *
 * THE rule: a cross-context file's standing comes from the UPSTREAM node, never from the active
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
	const upstreamIdTag = file.upstream?.idTag
	// An override that names no tenant decides nothing, so point at no node and grant nothing.
	const scopeUnresolved = override ? !override.idTag : !!upstreamIdTag && !contextIdTag
	const isCrossOwner = isCrossOwnerFile(upstreamIdTag, !!override)

	const scopeIdTag = isCrossOwner ? upstreamIdTag : override ? override.idTag : contextIdTag
	const scopeRoles = isCrossOwner ? ownerRoles : override ? override.roles : contextRoles

	// Cross-context: `accessLevel` is the ACTIVE context's answer about a row the UPSTREAM node
	// decides, so it cannot vouch for standing there.
	const scopedFile: ScopedFile = isCrossOwner ? { ...file, accessLevel: undefined } : file

	return {
		isCrossOwner,
		scopeUnresolved,
		upstreamIdTag,
		scopeIdTag,
		scopeRoles,
		scopedFile,
		grantCeiling: shareGrantCeiling(scopedFile, authIdTag, scopeRoles),
		canManageShares: !scopeUnresolved && canManageShares(scopedFile, authIdTag, scopeRoles),
		canReadShares: !scopeUnresolved && canReadShares(scopedFile, authIdTag, scopeRoles),
		canManageFile: !scopeUnresolved && canManageFile(scopedFile, authIdTag, scopeRoles),
		// `status` is still 'idle' on the render where isCrossOwner first becomes true, so both
		// states count as "not settled". An override says so for itself.
		resolving:
			scopeUnresolved ||
			!!override?.resolving ||
			(isCrossOwner && !isOwnerSettled(ownerStatus)),
		// Deliberately defined even when `scopeUnresolved`: an image host hint, not a grant.
		profileSrcTag: scopeIdTag ?? contextIdTag ?? authIdTag
	}
}

// vim: ts=4
