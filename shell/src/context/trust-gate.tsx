// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Trust gate for community context activation.
 *
 * Switching to a foreign (non-self) context implies sustained, identified
 * interaction with that community and therefore requires the same level of
 * consent as `'always'` trust on the profile page. The gate is invoked from
 * `setActiveContext` for any non-self idTag without stored `'always'`; the
 * caller is responsible for persisting trust on accept and aborting on reject.
 */

import * as React from 'react'
import { atom, useAtom, useAtomValue, useStore } from 'jotai'
import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '@cloudillo/react'

import { communitiesAtom } from './atoms'

export class ContextTrustGateRejectedError extends Error {
	constructor() {
		super('Trust gate rejected')
		this.name = 'ContextTrustGateRejectedError'
	}
}

/**
 * Thrown when a second `requestTrustGate` call arrives for a *different*
 * idTag while another gate is already on screen. Callers should treat this
 * as a no-op (the existing dialog is still pending for the earlier idTag) —
 * do NOT navigate away or surface as an error.
 *
 * A repeat call for the same idTag is folded into the existing pending
 * promise, so duplicate requests from a route effect that fires twice for
 * the same target don't reject the original.
 */
export class ContextTrustGateBusyError extends Error {
	constructor() {
		super('Trust gate already pending')
		this.name = 'ContextTrustGateBusyError'
	}
}

/**
 * Thrown when auth identity changes mid-switch (e.g. logout races a context
 * switch). Treated like gate rejection by `isTrustGateRejection` so route
 * handlers silence it, but kept distinct so the error message doesn't
 * misattribute the cause.
 */
export class ContextAuthChangedError extends Error {
	constructor() {
		super('Auth identity changed during context switch')
		this.name = 'ContextAuthChangedError'
	}
}

/**
 * True for any gate-control flow exception (rejection, busy, or auth drift).
 * All three are expected user/UI states, never logged, never surfaced.
 */
export function isTrustGateRejection(err: unknown): boolean {
	return (
		err instanceof ContextTrustGateRejectedError ||
		err instanceof ContextTrustGateBusyError ||
		err instanceof ContextAuthChangedError
	)
}

export interface TrustGateRequest {
	idTag: string
	/**
	 * All resolvers waiting on this idTag's gate. Multiple `requestTrustGate`
	 * calls for the same idTag (e.g. a route effect that re-fires before the
	 * user clicks) share a single dialog and resolve together when the user
	 * answers.
	 */
	resolvers: Array<(ok: boolean) => void>
}

export const trustGateAtom = atom<TrustGateRequest | undefined>(undefined)

type TrustGateSetter = (
	update:
		| TrustGateRequest
		| undefined
		| ((prev: TrustGateRequest | undefined) => TrustGateRequest | undefined)
) => void

/**
 * Open the trust-gate dialog for a foreign idTag and wait for the user's
 * choice. Same-idTag re-entries join the pending dialog; different-idTag
 * arrivals reject with `ContextTrustGateBusyError` so only the first owner
 * controls navigation. The busy decision lives inside the setter so two
 * concurrent calls targeting an empty atom can't both pass a pre-write check.
 */
export function requestTrustGate(setAtom: TrustGateSetter, idTag: string): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		let blocked = false
		setAtom((prev) => {
			blocked = false
			if (prev === undefined) return { idTag, resolvers: [resolve] }
			if (prev.idTag === idTag) {
				return { idTag, resolvers: [...prev.resolvers, resolve] }
			}
			blocked = true
			return prev
		})
		if (blocked) reject(new ContextTrustGateBusyError())
	})
}

export function TrustGateDialog() {
	const { t } = useTranslation()
	const store = useStore()
	const [request, setRequest] = useAtom(trustGateAtom)
	const communities = useAtomValue(communitiesAtom)

	// Resolve any pending request as rejected if the dialog unmounts (error
	// boundary, layout teardown, StrictMode double-mount) so awaiters in
	// `setActiveContext` don't hang forever.
	React.useEffect(() => {
		return () => {
			const pending = store.get(trustGateAtom)
			if (pending) {
				for (const r of pending.resolvers) r(false)
				store.set(trustGateAtom, undefined)
			}
		}
	}, [store])

	if (!request) return null

	const community = communities.find((c) => c.idTag === request.idTag)
	const displayName = community?.name || request.idTag

	const close = (ok: boolean) => {
		const { resolvers } = request
		setRequest(undefined)
		for (const resolve of resolvers) resolve(ok)
	}

	return (
		<Dialog open title={t('Trust this community?')} onClose={() => close(false)}>
			<div className="c-vbox g-2">
				<p>
					{t(
						'Switching to {{name}} will authenticate you on every visit, identical to choosing Always on the profile-page trust banner.',
						{ name: displayName }
					)}
				</p>
				<p>
					{t(
						'The community will be able to see when you visit. You can revoke this later from the trust settings.'
					)}
				</p>
			</div>
			<div className="c-group g-2 mt-4">
				<Button variant="primary" autoFocus onClick={() => close(true)}>
					{t('Always trust & switch')}
				</Button>
				<Button onClick={() => close(false)}>{t('Cancel')}</Button>
			</div>
		</Dialog>
	)
}

// vim: ts=4
