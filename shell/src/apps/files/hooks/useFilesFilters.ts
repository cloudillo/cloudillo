// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { ViewMode } from '../types.js'
import { MANAGED_FOLDER_ID, TRASH_FOLDER_ID } from '../types.js'

export type FilesScope = 'folder' | 'room' | 'all'
export type FilesType = 'doc' | 'file' | 'image' | 'folder'
// no 'network' chip yet (the API accepts it); add one with its label when wanted
export type FilesAccess = Exclude<NonNullable<Types.ListFilesQuery['access']>[number], 'network'>
export type FilesOwner = 'me' | 'others'
export type FilesModified = '7d' | '30d' | '365d'
export type FilesPerm = 'edit' | 'read'

/** The Files filter state, parsed from the URL */
export interface FilesFilters {
	/** Explicit scope only; absent = derived by `resolveScope` */
	scope?: FilesScope
	q: string
	starred: boolean
	recent: boolean
	tags: string[]
	type?: FilesType
	access: FilesAccess[]
	owner?: FilesOwner
	modified?: FilesModified
	perm?: FilesPerm
}

/** `null` (or `false`/`''`/`[]`) removes the param */
export type FilesFilterUpdates = { [K in keyof FilesFilters]?: FilesFilters[K] | null }

/** Kept when opening a subfolder from folder scope */
export const NARROWER_PARAMS = ['type', 'access', 'owner', 'modified', 'perm'] as const
export const FILTER_PARAMS = [
	'scope',
	'q',
	'starred',
	'recent',
	'tags',
	...NARROWER_PARAMS
] as const

const SCOPES: readonly FilesScope[] = ['folder', 'room', 'all']
const TYPES: readonly FilesType[] = ['doc', 'file', 'image', 'folder']
const ACCESS: readonly FilesAccess[] = ['private', 'audience', 'people', 'link', 'public']
const OWNERS: readonly FilesOwner[] = ['me', 'others']
const MODIFIED_DAYS: Record<FilesModified, number> = { '7d': 7, '30d': 30, '365d': 365 }
const PERMS: readonly FilesPerm[] = ['edit', 'read']
const TYPE_FILE_TP: Record<Exclude<FilesType, 'image'>, string> = {
	doc: 'CRDT,RTDB',
	file: 'BLOB',
	folder: 'FLDR'
}
const DAY = 86400
const RECENT_DAYS = 30

function oneOf<T extends string>(list: readonly T[], value: string | null): T | undefined {
	return value && (list as readonly string[]).includes(value) ? (value as T) : undefined
}

function parseList(value: string | null): string[] {
	return value ? value.split(',').filter(Boolean) : []
}

export function parseFilesFilters(params: URLSearchParams): FilesFilters {
	return {
		scope: oneOf(SCOPES, params.get('scope')),
		q: params.get('q') ?? '',
		starred: params.get('starred') === '1',
		recent: params.get('recent') === '1',
		tags: parseList(params.get('tags')),
		type: oneOf(TYPES, params.get('type')),
		access: parseList(params.get('access')).filter((a): a is FilesAccess =>
			(ACCESS as readonly string[]).includes(a)
		),
		owner: oneOf(OWNERS, params.get('owner')),
		modified: oneOf(Object.keys(MODIFIED_DAYS) as FilesModified[], params.get('modified')),
		perm: oneOf(PERMS, params.get('perm'))
	}
}

/** A finder (`q`, `starred`, `recent`, `tags`) widens the derived scope to the room */
export function isFinderActive(f: FilesFilters): boolean {
	return !!f.q.trim() || f.starred || f.recent || f.tags.length > 0
}

/** Explicit `scope` wins; otherwise `room` while a finder is active, else `folder` */
export function resolveScope(f: FilesFilters): FilesScope {
	return f.scope ?? (isFinderActive(f) ? 'room' : 'folder')
}

/** The `scope` param for picking `scope`: the derived default clears it */
export function scopeParam(filters: FilesFilters, scope: FilesScope): FilesScope | null {
	return scope === resolveScope({ ...filters, scope: undefined }) ? null : scope
}

/** Active filters, each param counting once (`scope` is a place, not a filter) */
export function countActiveFilters(f: FilesFilters): number {
	return [
		!!f.q.trim(),
		f.starred,
		f.recent,
		f.tags.length > 0,
		!!f.type,
		f.access.length > 0,
		!!f.owner,
		!!f.modified,
		!!f.perm
	].filter(Boolean).length
}

/** The query string of just `keys` taken from `params` (for the `navSearch` passthrough) */
export function filterSearch(
	params: URLSearchParams,
	keys: readonly string[] = FILTER_PARAMS
): string {
	const out = new URLSearchParams()
	for (const key of keys) {
		const value = params.get(key)
		if (value) out.set(key, value)
	}
	return out.toString()
}

/**
 * Legacy `view=starred|recent` → the Starred / Recent finder: the replacement query string,
 * or null when `params` has no legacy view. Used by `redirectLegacyView` in `useFileNavigation`.
 */
export function legacySearch(params: URLSearchParams): string | null {
	const view = params.get('view')
	if (view !== 'starred' && view !== 'recent') return null
	const next = new URLSearchParams()
	for (const [key, value] of params) {
		if (key === 'view') next.append(value, '1')
		else next.append(key, value)
	}
	return next.toString()
}

export interface FilesQueryContext {
	viewMode: ViewMode
	/** Current folder; null = the room root */
	parentId: string | null
	/** Local room's channel (`''` = main room); undefined while remote browsing */
	channel?: string
	/** Remote share root: room scope lists its subtree */
	shareRoot?: string | null
	/** idTag the owner me/others filter compares against */
	ownerIdTag?: string
	/** Unix seconds; defaults to the start of today (UTC) */
	now?: number
}

/** Map the filters to `ListFilesQuery` fields (no cursor/limit/sort; `recent` sets its own sort) */
export function buildFileFilterParams(
	f: FilesFilters,
	ctx: FilesQueryContext
): Types.ListFilesQuery {
	const q = f.q.trim()
	// Trash/Managed: only the name search applies
	if (ctx.viewMode !== 'browse') {
		return {
			parentId: ctx.viewMode === 'trash' ? TRASH_FOLDER_ID : MANAGED_FOLDER_ID,
			withParent: true,
			...(q && { fileName: q })
		}
	}

	// day-granular "now" keeps the query (and the list's deps) stable across renders
	const now = ctx.now ?? Math.floor(Date.now() / 1000 / DAY) * DAY
	const scope = resolveScope(f)
	const params: Types.ListFilesQuery = {}

	if (scope === 'folder') {
		params.parentId = ctx.parentId ?? '__root__'
		if (ctx.parentId === null && ctx.channel !== undefined) params.channel = ctx.channel
	} else {
		params.recursive = true
		params.withParent = true
		if (scope === 'room') {
			if (ctx.shareRoot) {
				params.parentId = ctx.shareRoot
			} else {
				params.parentId = '__root__'
				params.channel = ctx.channel ?? ''
			}
		}
	}

	if (q) params.fileName = q
	if (f.starred) params.starred = true
	if (f.recent) {
		params.openedSince = now - RECENT_DAYS * DAY
		params.sort = 'recent'
		params.sortDir = 'desc'
	}
	if (f.tags.length > 0) params.tags = f.tags
	if (f.access.length > 0) params.access = f.access
	if (f.owner === 'me' && ctx.ownerIdTag) params.ownerIdTag = ctx.ownerIdTag
	else if (f.owner === 'others' && ctx.ownerIdTag) params.notOwnerIdTag = ctx.ownerIdTag
	if (f.modified) params.modifiedAfter = now - MODIFIED_DAYS[f.modified] * DAY

	if (f.type === 'image') {
		// Drops folders too; FilterBar shows a hint
		params.contentType = 'image/*'
	} else if (f.type) {
		// Folder scope keeps subfolders navigable under a type narrower
		params.fileTp =
			scope === 'folder' && f.type !== 'folder'
				? `${TYPE_FILE_TP[f.type]},FLDR`
				: TYPE_FILE_TP[f.type]
	}

	return params
}

/** `prev` with `updates` applied; `scope=folder` is dropped while no finder is active (it is the default) */
export function applyFilterUpdates(
	prev: URLSearchParams,
	updates: FilesFilterUpdates
): URLSearchParams {
	const next = new URLSearchParams(prev)
	for (const [key, value] of Object.entries(updates)) {
		const str = Array.isArray(value)
			? value.join(',')
			: value === true
				? '1'
				: typeof value === 'string'
					? value
					: ''
		if (str) next.set(key, str)
		else next.delete(key)
	}
	if (next.get('scope') === 'folder' && !isFinderActive(parseFilesFilters(next))) {
		next.delete('scope')
	}
	return next
}

export function useFilesFilters() {
	const [searchParams, setSearchParams] = useSearchParams()
	const filters = React.useMemo(() => parseFilesFilters(searchParams), [searchParams])

	// Filter changes replace the history entry; only place navigation pushes
	const setFilter = React.useCallback(
		(updates: FilesFilterUpdates) => {
			setSearchParams((prev) => applyFilterUpdates(prev, updates), { replace: true })
		},
		[setSearchParams]
	)

	const setScope = React.useCallback(
		(scope: FilesScope) => {
			setFilter({ scope: scopeParam(filters, scope) })
		},
		[filters, setFilter]
	)

	// Keeps the place (`room`, `parentId`, `view`, `remoteOwner`, `shareRoot`)
	const clearAll = React.useCallback(() => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev)
				for (const key of FILTER_PARAMS) next.delete(key)
				return next
			},
			{ replace: true }
		)
	}, [setSearchParams])

	const toListQuery = React.useCallback(
		(ctx: FilesQueryContext) => buildFileFilterParams(filters, ctx),
		[filters]
	)

	return {
		filters,
		effectiveScope: resolveScope(filters),
		finderActive: isFinderActive(filters),
		activeCount: countActiveFilters(filters),
		setFilter,
		setScope,
		clearAll,
		toListQuery
	}
}

export type UseFilesFiltersReturn = ReturnType<typeof useFilesFilters>

// vim: ts=4
