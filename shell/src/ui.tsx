// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import React from 'react'

//////////
// Page //
//////////
interface PageProps {
	title?: string
	noBackButton?: boolean
	actions?: React.ReactNode
	children: React.ReactNode
}

export function Page({ title, children }: PageProps) {
	return (
		<div>
			{title && <h2>{title}</h2>}
			{children}
		</div>
	)
}

// vim: ts=4
