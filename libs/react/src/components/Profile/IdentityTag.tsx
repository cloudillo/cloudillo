// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'

export interface IdentityTagProps {
	className?: string
	idTag?: string
}

/** Non-ASCII, or a 0/1/5 (o/l/s look-alikes). */
function isConfusable(c: string) {
	return c.charCodeAt(0) > 0x7f || '015'.includes(c)
}

export function IdentityTag({ className, idTag = '-' }: IdentityTagProps) {
	const { t } = useLibTranslation()
	// Runs of [text, confusable]
	const runs: [string, boolean][] = []
	Array.from(idTag).forEach((c) => {
		const flag = isConfusable(c)
		const last = runs[runs.length - 1]
		if (last && last[1] === flag) last[0] += c
		else runs.push([c, flag])
	})

	return (
		<span className={className}>
			@
			{runs.map(([text, flag], i) =>
				flag ? (
					<span
						key={i}
						className="c-identity-confusable"
						title={t('Contains characters that look like letters')}
					>
						{text}
					</span>
				) : (
					<React.Fragment key={i}>{text}</React.Fragment>
				)
			)}
		</span>
	)
}

// vim: ts=4
