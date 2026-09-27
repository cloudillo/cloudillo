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

import {
	EmptyState,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	Segmented,
	SegmentedItem,
	useApi,
	useToast
} from '@cloudillo/react'
import type { Profile, ProfileTrust } from '@cloudillo/types'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuShield as IcShield,
	LuShieldCheck as IcShieldCheck,
	LuShieldOff as IcShieldOff
} from 'react-icons/lu'

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

	const trustSegments: Array<{ value: ProfileTrust | 'ask'; label: string }> = [
		{ value: 'always', label: t('Always') },
		{ value: 'ask', label: t('Ask') },
		{ value: 'never', label: t('Never') }
	]

	if (rows === undefined) return <LoadingSpinner className="auto-bg" />

	if (rows.length === 0) {
		return (
			<EmptyState
				className="auto-bg"
				size="sm"
				title={t('No trusted profiles')}
				description={t(
					'You have not marked any profiles as Always or Never. Open a profile page to set a preference.'
				)}
			/>
		)
	}

	return (
		<Panel title={t('Trusted profiles')}>
			<List>
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
					const current = trust ?? 'ask'
					return (
						<ListItem
							key={profile.idTag}
							leading={<Icon size="1.5rem" className={iconClass} />}
							title={profile.name || profile.idTag}
							subtitle={`@${profile.idTag}`}
							trailing={
								<Segmented
									size="sm"
									aria-label={t('Trust preference')}
									value={current}
									onChange={(value) => {
										if (value === current) return
										void apply(
											profile.idTag,
											value === 'ask' ? null : (value as ProfileTrust)
										)
									}}
								>
									{trustSegments.map((seg) => (
										<SegmentedItem
											key={seg.value}
											value={seg.value}
											disabled={busy}
										>
											{seg.label}
										</SegmentedItem>
									))}
								</Segmented>
							}
						/>
					)
				})}
			</List>
		</Panel>
	)
}

// vim: ts=4
