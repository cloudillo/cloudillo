// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A published page the container does not hold.
 *
 * Not the shell's `NotFound` (`shell/src/NotFound.tsx`), which offers the feed —
 * an address a drive-by reader has no session for and no interest in. This one
 * points at the site's own start page, and nothing else. The container's
 * `404.part.html` covers the cold load; a client-side miss lands here.
 */

import { Button, EmptyState } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMapPinOff as IcNotFound } from 'react-icons/lu'

export function SiteNotFound() {
	const { t } = useTranslation()

	return (
		<EmptyState
			fill
			icon={<IcNotFound size="4rem" className="text-muted" />}
			title={t('Page not found')}
			description={t('This address is not part of this site.')}
			action={
				// An absolute URL, so `Button` renders a plain anchor rather than a
				// router link: the site root is the one path the runtime cannot
				// resolve client-side, so this is a real navigation by design.
				<Button href={`${window.location.origin}/`} color="accent">
					{t('Go to the start page')}
				</Button>
			}
		/>
	)
}

// vim: ts=4
