// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { mergeClasses, ProfileCard, useApi } from '@cloudillo/react'
import * as React from 'react'

export interface GuestOwnerChipProps {
	/** Identity tag of the domain owner (the tenant). */
	idTag: string
	className?: string
}

/**
 * GuestOwnerChip — owner attribution card for the shell header. Shown next to
 * the Cloudillo logo whenever an anonymous visitor is on the owner's domain
 * (both `/s/...` share links and normal guest browsing). Renders the canonical
 * `ProfileCard` so it matches profile cards elsewhere.
 *
 * Uses `getRemoteFull` (an anonymous `GET /me/full` against the owner's node)
 * rather than `profiles.get` — the latter returns only the caller's *local
 * relationship* mirror, which is null for an anonymous guest, leaving the name
 * and picture empty. `getRemoteFull` is the same call the profile page uses to
 * render a profile for logged-out visitors.
 */
export function GuestOwnerChip({ idTag, className }: GuestOwnerChipProps) {
	const { api } = useApi()
	const [name, setName] = React.useState<string | undefined>(undefined)
	const [profilePic, setProfilePic] = React.useState<string | undefined>(undefined)

	React.useEffect(() => {
		let cancelled = false
		if (!api) return
		;(async function () {
			try {
				const profile = await api.profiles.getRemoteFull(idTag)
				if (cancelled || !profile) return
				setName(profile.name)
				setProfilePic(profile.profilePic)
			} catch (err) {
				console.error('[GuestOwnerChip] Failed to load owner profile:', err)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [api, idTag])

	return (
		<ProfileCard
			className={mergeClasses('align-items-center', className)}
			profile={{ idTag, name, profilePic }}
			srcTag={idTag}
			alt={name || idTag}
		/>
	)
}

// vim: ts=4
