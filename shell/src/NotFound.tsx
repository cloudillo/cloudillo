// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's 404. Reached from two places: the top-level `*` fallback, an unknown
 * section under a valid context, and `ContextGuard` when segment 1 carries no sigil —
 * a typo (`/~/settngs`), a stale in-app link, or a legacy section-first URL that the
 * backend happened to serve.
 *
 * The "go home" link is context-scoped: someone who mistyped a section inside a
 * community should land back in that community, not at their own feed.
 */

import { Button, EmptyState } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMapPinOff as IcNotFound } from 'react-icons/lu'

import { useCtx } from './context/index.js'
import { feedPath } from './routes.js'

export function NotFound() {
	const { t } = useTranslation()
	const ctx = useCtx()

	return (
		<EmptyState
			fill
			className="auto-bg"
			size="lg"
			icon={<IcNotFound />}
			title={t('Page not found')}
			description={t('This address does not match anything in Cloudillo.')}
			action={
				<Button color="accent" href={feedPath(ctx.base)}>
					{t('Go to the feed')}
				</Button>
			}
		/>
	)
}

// vim: ts=4
