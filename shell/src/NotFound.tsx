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

import { EmptyState } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMapPinOff as IcNotFound } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { useCtx } from './context/index.js'
import { feedPath } from './routes.js'

export function NotFound() {
	const { t } = useTranslation()
	const ctx = useCtx()

	return (
		<div className="c-panel flex-fill d-flex align-items-center justify-content-center">
			<EmptyState
				icon={<IcNotFound size="4rem" className="text-muted" />}
				title={t('Page not found')}
				description={t('This address does not match anything in Cloudillo.')}
				action={
					<Link to={feedPath(ctx.base)} className="c-button accent">
						{t('Go to the feed')}
					</Link>
				}
			/>
		</div>
	)
}

// vim: ts=4
