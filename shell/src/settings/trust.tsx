// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Trusted profiles settings page.
 *
 * Lists every foreign profile that has a non-null `trust` value set on the
 * local `profiles` table. Lets the user change the decision ('always' ↔ 'never')
 * or clear it entirely (back to "ask").
 *
 * Data source: `api.profiles.listTrust()` → `GET /api/profiles?trustSet=true`.
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import {
	LuShield as IcShield,
	LuShieldCheck as IcShieldCheck,
	LuShieldOff as IcShieldOff
} from 'react-icons/lu'

import { useApi, LoadingSpinner, useToast } from '@cloudillo/react'
import type { Profile, ProfileTrust } from '@cloudillo/types'

import { storedTrustAtom, useProfileTrust } from '../context/index.js'

export function TrustSettings(): React.ReactElement {
	const { t } = useTranslation()
	const { api } = useApi()
	const { setStoredTrust, rememberStoredTrust } = useProfileTrust()
	const { error: toastError } = useToast()
	const storedTrust = useAtomValue(storedTrustAtom)
	const [profiles, setProfiles] = React.useState<Profile[] | undefined>()
	const [busyIdTag, setBusyIdTag] = React.useState<string | undefined>()

	// Render-ready rows: prefer the enriched fetched list (has `name`), fall back
	// to the cached stored-trust atom (idTag + trust only). The app-level
	// `useProfileTrustBootstrap` populates the atom on login, so navigating
	// here usually shows the list immediately and the background fetch just
	// enriches it with display names.
	const rows = React.useMemo<Profile[] | undefined>(() => {
		if (profiles) return profiles
		if (storedTrust.size === 0) return undefined
		return Array.from(storedTrust.entries()).map(([idTag, trust]) => ({
			idTag,
			trust
		}))
	}, [profiles, storedTrust])

	const load = React.useCallback(async () => {
		if (!api) return
		try {
			const list = await api.profiles.listTrust()
			setProfiles(list)
			// Seed the in-memory cache with the authoritative list.
			for (const p of list) {
				rememberStoredTrust(p.idTag, p.trust ?? null)
			}
		} catch (err) {
			console.error('Failed to load trusted profiles:', err)
			toastError(t('Failed to load trusted profiles'))
			setProfiles([])
		}
	}, [api, rememberStoredTrust, toastError, t])

	React.useEffect(() => {
		void load()
	}, [load])

	const apply = async (idTag: string, level: ProfileTrust | null) => {
		setBusyIdTag(idTag)
		try {
			await setStoredTrust(idTag, level)
			// Optimistic UI: setStoredTrust already updated the in-memory cache
			// and the server, so avoid a full listTrust() refetch (which would
			// flash the list empty via the LoadingSpinner fallback). For 'null'
			// (Ask) keep the row visible with the new state reflected —
			// listTrust() only returns non-null rows, so it will disappear on
			// next reload, but staying for now lets the user undo without
			// re-opening the profile page.
			setProfiles((prev) => {
				if (!prev) return prev
				return prev.map((p) =>
					p.idTag === idTag ? { ...p, trust: level ?? undefined } : p
				)
			})
		} catch (err) {
			console.error('Failed to update trust:', err)
			toastError(t('Failed to update trust preference'))
		} finally {
			setBusyIdTag(undefined)
		}
	}

	const trustSegments: Array<{
		value: ProfileTrust | null
		label: string
		activeClass: string
	}> = [
		{ value: 'always', label: t('Always'), activeClass: 'success' },
		{ value: null, label: t('Ask'), activeClass: 'primary' },
		{ value: 'never', label: t('Never'), activeClass: 'warning' }
	]

	if (rows === undefined) return <LoadingSpinner />

	if (rows.length === 0) {
		return (
			<div className="c-panel p-3">
				<p className="text-muted">{t('No trusted profiles')}</p>
				<p className="c-hint">
					{t(
						'You have not marked any profiles as Always or Never. Open a profile page to set a preference.'
					)}
				</p>
			</div>
		)
	}

	return (
		<div className="c-panel p-0">
			<h4 className="p-3 pb-2">{t('Trusted profiles')}</h4>
			<ul className="c-vbox g-1 p-2" style={{ listStyle: 'none', margin: 0 }}>
				{rows.map((profile) => {
					const trust = profile.trust ?? null
					const Icon =
						trust === 'always'
							? IcShieldCheck
							: trust === 'never'
								? IcShieldOff
								: IcShield
					const iconClass =
						trust === 'always'
							? 'flex-shrink-0 text-success'
							: trust === 'never'
								? 'flex-shrink-0 text-warning'
								: 'flex-shrink-0 text-muted'
					const busy = busyIdTag === profile.idTag
					return (
						<li key={profile.idTag} className="c-hbox g-2 p-2 align-items-center">
							<Icon size="1.5rem" className={iconClass} />
							<div className="c-vbox flex-fill">
								<div className="font-weight-bold">
									{profile.name || profile.idTag}
								</div>
								<div className="text-muted">{`@${profile.idTag}`}</div>
							</div>
							<div
								className="c-input-group w-auto"
								role="group"
								aria-label={t('Trust preference')}
							>
								{trustSegments.map((seg) => {
									const active = seg.value === trust
									return (
										<button
											key={seg.value ?? 'ask'}
											type="button"
											className={
												active
													? `c-button ${seg.activeClass}`
													: 'c-button secondary'
											}
											aria-pressed={active}
											onClick={() => {
												if (active) return
												void apply(profile.idTag, seg.value)
											}}
											disabled={busy}
										>
											{seg.label}
										</button>
									)
								})}
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

// vim: ts=4
