// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { IdentityTag, ProfilePicture, useApi, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { isGuestDocumentPath, useGuestDocument } from '../context/index.js'
import { HOME_BASE, isBootstrapPath, profilePath } from '../routes.js'

/**
 * Owner attribution strip under the shell header, shown to anonymous visitors on the
 * owner's domain (both `/s/...` share links and normal guest browsing): the provenance
 * signal for someone who landed on a stranger's node via a link. Its own row, so the
 * 3.5rem header stays free for logo + omnibox + sign in at every width.
 *
 * Uses `getRemoteFull` (an anonymous `GET /me/full` against the owner's node) rather than
 * `profiles.get`, which returns only the caller's *local relationship* mirror — null for an
 * anonymous guest, leaving the name and picture empty.
 */
export function GuestOwnerBanner() {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()
	const location = useLocation()
	const [guestDocument] = useGuestDocument()
	const [name, setName] = React.useState<string | undefined>(undefined)
	const [profilePic, setProfilePic] = React.useState<string | undefined>(undefined)

	const idTag = api?.idTag
	// `auth === undefined` is the boot phase, not "logged out" — see the render guard below.
	const isGuest = auth === null

	React.useEffect(() => {
		let cancelled = false
		if (!isGuest || !api || !idTag) return
		;(async function () {
			try {
				const profile = await api.profiles.getRemoteFull(idTag)
				if (cancelled || !profile) return
				setName(profile.name)
				setProfilePic(profile.profilePic)
			} catch (err) {
				console.error('[GuestOwnerBanner] Failed to load owner profile:', err)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [isGuest, api, idTag])

	// Absent during the boot phase too, so the strip never flashes in for a returning user.
	if (!isGuest || !idTag) return null
	if (isBootstrapPath(location.pathname)) return null

	// The `/s/` prefix test stands on its own: any share route is a shared resource,
	// even before the atom is set and even for a different refId.
	const label =
		location.pathname.startsWith('/s/') || isGuestDocumentPath(location.pathname, guestDocument)
			? t('Shared by')
			: t('Hosted by')

	return (
		<div className="c-guest-banner">
			<span className="label">{label}</span>
			<Link className="owner" to={profilePath(HOME_BASE, 'me')} title={idTag}>
				<ProfilePicture profile={{ profilePic }} srcTag={idTag} tiny />
				<span className="name">{name || idTag}</span>
				{/* Only alongside a real name — without one the name span already *is*
				    the idTag. Kept at every width: the CSS shrinks the tag rather than
				    hiding it, where `sm-hide` dropped it below 48rem, i.e. every phone. */}
				{!!name && (
					<span className="tag">
						<IdentityTag idTag={idTag} />
					</span>
				)}
			</Link>
		</div>
	)
}

// vim: ts=4
