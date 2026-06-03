// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { IdentityTag, mergeClasses, UnknownProfilePicture, useApi } from '@cloudillo/react'
import * as React from 'react'

export interface GuestOwnerChipProps {
	/** Identity tag of the domain owner (the tenant). */
	idTag: string
	className?: string
}

/**
 * GuestOwnerChip — owner attribution card for the shell header. Shown next to
 * the Cloudillo logo whenever an anonymous visitor is on the owner's domain
 * (both `/s/...` share links and normal guest browsing). Mirrors the canonical
 * `ProfileCard` markup (`c-profile-card` → picture + `.body` → `.name` +
 * `.tag`) so it matches profile cards elsewhere, but renders the picture for
 * logged-out guests too (`ProfileCard` gates the image on `auth`).
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
		<div className={mergeClasses('c-profile-card align-items-center', className)}>
			{profilePic ? (
				<img
					className="picture"
					src={getFileUrl(idTag, profilePic, 'vis.pf')}
					alt={name || idTag}
				/>
			) : (
				<UnknownProfilePicture />
			)}
			<div className="body">
				{name && <h4 className="name">{name}</h4>}
				<div className="tag">
					<IdentityTag idTag={idTag} />
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
