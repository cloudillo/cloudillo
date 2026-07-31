// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import { useAuth } from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'

import {
	activeContextAtom,
	useApiContext,
	useContextAwareApi,
	useCurrentContextIdTag
} from '../../../context/index.js'
import type { FileAccessLevel, OwnerLookupStatus, ScopedFile } from '../utils.js'
import { deriveFileOwnerScope, isCrossOwnerFile } from '../utils.js'

export interface FileOwnerScope {
	/** The node that actually holds the file, and the only one whose answers count */
	api: ApiClient | null
	/** True when the file belongs to a tenant other than the active context */
	isCrossOwner: boolean
	ownerIdTag: string | undefined
	/** The tenant whose standing decides what we may do: the owner, else the active context */
	scopeIdTag: string | undefined
	/** Roles we hold ON `scopeIdTag` - NOT the active context's roles when cross-owner */
	scopeRoles: string[]
	/** The file the predicates actually judged: an ownerless row back-filled to `scopeIdTag`, a
	 *  cross-owner one with the active context's `accessLevel` stripped */
	scopedFile: ScopedFile
	/** The highest level a share or link may carry here - the backend's `grant_ceiling` */
	grantCeiling: FileAccessLevel
	/** canManageShares(), already judged against the right tenant */
	canManageShares: boolean
	/**
	 * canReadShares(): may we LIST the share entries. Wider than managing them - the backend lets
	 * any writer enumerate - so the Sharing panel can show who a file is shared with to someone who
	 * may not change it.
	 */
	canReadShares: boolean
	/** Rename / delete / visibility, judged against the node in `api` - the one those calls reach */
	canManageFile: boolean
	/**
	 * The scope has not settled yet - either the active context or the owner's proxy token is still
	 * in flight. `api` is null meanwhile, and a refusal for a fetch in progress is a lie, so callers
	 * must show a waiting state. The permission flags are NOT all false meanwhile: the owner branch
	 * needs no roles, so our OWN cross-owner file reads as manageable before any node is reached.
	 */
	resolving: boolean
}

/**
 * The owner's node and our standing on it, acquired together. A bare `api: null` cannot say whether
 * the token is still coming or was refused; the status is what tells them apart.
 */
type OwnerState = {
	status: OwnerLookupStatus
	api: ApiClient | null
	roles: string[]
}

/**
 * An already-decided node, plus the standing that goes with it. Naming only the api client lets the
 * two drift: a caller handing over a remote tenant's client while roles are still judged against the
 * active context produces the "full share UI, then 403" this hook exists to prevent.
 */
export interface FileOwnerScopeOverride {
	/** The node the caller has already decided to use */
	api: ApiClient | null
	/** The tenant that node belongs to - whose standing decides what we may do there */
	idTag: string | undefined
	/** Roles we hold on that tenant, from the same proxy token that minted `api` */
	roles: string[]
	/**
	 * The node is decided but `api` has not landed yet. Set it rather than dropping the override:
	 * without one the row is re-judged against the ACTIVE context, where an ownerless row
	 * short-circuits canManageFile to `true`.
	 */
	resolving?: boolean
}

/**
 * Which node a file's permission calls go to, and whose roles decide whether we may make them.
 *
 * THE single derivation, shared by DetailsPanel and the ShareDialog it opens: the panel offers the
 * Share affordance and the dialog acts on it, so deriving this twice lets them disagree.
 *
 * Cross-owner standing cannot be read off `activeContext.roles`: being a leader of community B says
 * nothing about tenant A. The proxy token issued for the owner carries the real answer, so the roles
 * come back with it.
 *
 * @param override when supplied, the caller already knows which node to use - a remote share list,
 * say - so no owner lookup happens at all. It must name the tenant AND the roles held there, not
 * just the client: the api and the standing that gates it are decided together or not at all.
 */
export function useFileOwnerScope(
	file: ScopedFile,
	override?: FileOwnerScopeOverride
): FileOwnerScope {
	const { getTokenFor, getClientFor } = useApiContext()
	const { api: contextApi } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)

	const ownerIdTag = file.owner?.idTag
	// The one flag the EFFECT below branches on; deriveFileOwnerScope recomputes it from the same
	// helper, so the two cannot drift.
	const isCrossOwner = isCrossOwnerFile(ownerIdTag, contextIdTag, !!override)

	const [ownerState, setOwnerState] = React.useState<OwnerState>(() =>
		// 'idle' would make `resolving` false on the first render, before the effect below has run.
		// The lookup is already inevitable at this point, so say so.
		isCrossOwner
			? { status: 'loading', api: null, roles: [] }
			: { status: 'idle', api: null, roles: [] }
	)

	React.useEffect(
		function acquireOwnerApi() {
			if (!isCrossOwner || !ownerIdTag) {
				setOwnerState({ status: 'idle', api: null, roles: [] })
				return
			}
			// Unconditional WITHIN this branch, before any await: `ownerIdTag` changing from one
			// foreign tenant to another keeps `isCrossOwner` true, and the previous owner's client
			// and roles must not survive into the new owner's render.
			setOwnerState({ status: 'loading', api: null, roles: [] })
			let cancelled = false
			;(async function () {
				try {
					const tokenResult = await getTokenFor(ownerIdTag, { explicit: true })
					if (cancelled) return
					const client = tokenResult
						? getClientFor(ownerIdTag, { token: tokenResult.token })
						: null
					if (!cancelled) {
						// No token means no client, which is a refusal and not a result.
						setOwnerState(
							client
								? { status: 'ready', api: client, roles: tokenResult?.roles ?? [] }
								: { status: 'failed', api: null, roles: [] }
						)
					}
				} catch {
					if (!cancelled) setOwnerState({ status: 'failed', api: null, roles: [] })
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[isCrossOwner, ownerIdTag, getTokenFor, getClientFor]
	)

	// Memoized because DetailsPanel and ShareDialog both use `api` as an effect dependency: a fresh
	// object on every render would re-run their share fetches on every keystroke elsewhere.
	const derived = React.useMemo(
		() =>
			deriveFileOwnerScope({
				file,
				authIdTag: auth?.idTag,
				contextIdTag,
				ownerStatus: ownerState.status,
				ownerRoles: ownerState.roles,
				contextRoles: activeContext?.roles ?? [],
				override: override
					? {
							idTag: override.idTag,
							roles: override.roles,
							resolving: override.resolving
						}
					: undefined
			}),
		[
			file,
			auth?.idTag,
			contextIdTag,
			ownerState.status,
			ownerState.roles,
			activeContext?.roles,
			override
		]
	)

	return React.useMemo(() => {
		// The one thing the derivation cannot own: it holds no ApiClient. Same three-way choice,
		// judged on the same two flags.
		let api: ApiClient | null = null
		if (!derived.scopeUnresolved) {
			if (override) api = override.api
			else if (derived.isCrossOwner) api = ownerState.api
			else api = contextApi
		}
		return {
			api,
			isCrossOwner: derived.isCrossOwner,
			ownerIdTag: derived.ownerIdTag,
			scopeIdTag: derived.scopeIdTag,
			scopeRoles: derived.scopeRoles,
			scopedFile: derived.scopedFile,
			grantCeiling: derived.grantCeiling,
			canManageShares: derived.canManageShares,
			canReadShares: derived.canReadShares,
			canManageFile: derived.canManageFile,
			resolving: derived.resolving
		}
	}, [derived, override, ownerState.api, contextApi])
}

// vim: ts=4
