// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Center, Container, Panel, VBox } from '@cloudillo/react'
import * as React from 'react'

const WIDTH = { sm: '28rem', md: '40rem' } as const

export interface AuthLayoutProps {
	/** Shown centred above the card, e.g. `<Logo animated={busy} />` */
	logo?: React.ReactNode
	title: React.ReactNode
	subtitle?: React.ReactNode
	children?: React.ReactNode
	/** Below the panel body: primary actions, "back to login" links */
	footer?: React.ReactNode
	width?: keyof typeof WIDTH
}

/**
 * The guest/bootstrap screen frame (login, reset, activate, onboarding, register):
 * the logo above one centred Panel in a scrolling Container. The shell renders these
 * routes without rail and dock (`isAuthScreen` in `layout.tsx`).
 */
export function AuthLayout({
	logo,
	title,
	subtitle,
	children,
	footer,
	width = 'sm'
}: AuthLayoutProps) {
	return (
		<Container>
			<Center
				className="p-3"
				style={{ '--center-min-height': '100%' } as React.CSSProperties}
			>
				<VBox gap={3} className="w-100" style={{ maxWidth: WIDTH[width] }}>
					{logo && (
						<Center>
							<VBox style={{ width: '5rem' }}>{logo}</VBox>
						</Center>
					)}
					<Panel title={title} description={subtitle}>
						{children}
						{footer && <VBox className="mt-3">{footer}</VBox>}
					</Panel>
				</VBox>
			</Center>
		</Container>
	)
}

// vim: ts=4
