// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Alert, HBox, IdentityTag, ProfilePicture, Text, useApi, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { isGuestDocumentPath, useGuestDocument } from '../context/index.js'
import { HOME_BASE, isBootstrapPath, profilePath } from '../routes.js'
import { siteSeed } from '../site/detect.js'
import { siteRouteActiveAtom } from '../site/state.js'

/**
 * Owner attribution strip under the shell header, shown to anonymous visitors on the
 * owner's domain (both `/s/...` share links and normal guest browsing): the provenance
 * signal for someone who landed on a stranger's node via a link. Its own row, so the
 * 3.5rem header stays free for logo + omnibox + sign in at every width.
 *
 * Uses `getRemoteFull` (an anonymous `GET /me/full` against the owner's node) rather than
 * `profiles.get`, which returns only the caller's *local relationship* mirror — null for an
 * anonymous guest, leaving the name and picture empty.
 *
 * **On a published page it stands down entirely** (`siteRouteActiveAtom`): the site bar
 * carries the same provenance in the same row as the nav, and two strips would be one
 * chrome row too many. Off the site route but still on a site document — a guest following
 * a link into `/@alice/app/quillo/…` — it is back, and even then it does not fetch: the
 * wrapper's boot seed already carries the owner's name and picture (§5.4).
 */
export function GuestOwnerBanner() {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()
	const location = useLocation()
	const [guestDocument] = useGuestDocument()
	const siteRouteActive = useAtomValue(siteRouteActiveAtom)
	const [name, setName] = React.useState<string | undefined>(undefined)
	const [profilePic, setProfilePic] = React.useState<string | undefined>(undefined)

	const idTag = api?.idTag
	// `auth === undefined` is the boot phase, not "logged out" — see the render guard below.
	const isGuest = auth === null
	// The site's owner *is* this node's owner, so the seed answers for the same profile
	// this component would fetch — and it is already here, before the first paint.
	const seeded = siteSeed && siteSeed.owner.idTag === idTag ? siteSeed.owner : undefined

	React.useEffect(() => {
		let cancelled = false
		if (!isGuest || !api || !idTag || seeded) return
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
	}, [isGuest, api, idTag, seeded])

	// Absent during the boot phase too, so the strip never flashes in for a returning user.
	if (!isGuest || !idTag) return null
	if (siteRouteActive) return null
	if (isBootstrapPath(location.pathname)) return null

	// The `/s/` prefix test stands on its own: any share route is a shared resource,
	// even before the atom is set and even for a different refId.
	const label =
		location.pathname.startsWith('/s/') || isGuestDocumentPath(location.pathname, guestDocument)
			? t('Shared by')
			: t('Hosted by')

	const ownerName = seeded?.name ?? name
	const ownerPic = seeded?.profilePic ?? profilePic

	// `role="note"`: provenance, not news — Alert's default `status` would announce it on
	// every navigation.
	return (
		<Alert color="neutral" compact icon={false} role="note" className="rounded-0">
			<HBox gap={2} align="center">
				<Text emphasis="muted" className="flex-shrink-0">
					{label}
				</Text>
				<Link
					className="c-hbox g-1 align-items-center min-w-0"
					to={profilePath(HOME_BASE, 'me')}
					title={idTag}
				>
					<ProfilePicture profile={{ profilePic: ownerPic }} srcTag={idTag} tiny />
					<Text weight="semibold" truncate>
						{ownerName || idTag}
					</Text>
					{/* Only alongside a real name — without one the name already *is* the idTag. */}
					{!!ownerName && (
						<Text emphasis="muted" truncate>
							<IdentityTag idTag={idTag} />
						</Text>
					)}
				</Link>
			</HBox>
		</Alert>
	)
}

// vim: ts=4
