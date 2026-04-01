// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

export interface IdentityTagProps {
	className?: string
	idTag?: string
}

export function IdentityTag({ className, idTag = '-' }: IdentityTagProps) {
	const segments = idTag.match(/([a-zA-Z.]+|[^a-zA-Z.]+)/g) || []

	return (
		<span className={className}>
			@
			{segments.map((segment, i) => (
				<span key={i} className={/[^a-zA-Z.]/.test(segment) ? 'text-warning' : undefined}>
					{segment}
				</span>
			))}
		</span>
	)
}

// vim: ts=4
