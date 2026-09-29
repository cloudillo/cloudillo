// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuArrowLeft as IcBack } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { HBox } from '../Box/HBox.js'
import { VBox } from '../Box/VBox.js'
import { useLibTranslation } from '../../i18n.js'
import type { HeadingLevel } from '../Text/Heading.js'
import { Heading } from '../Text/Heading.js'
import { Text } from '../Text/Text.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
	title: React.ReactNode
	subtitle?: React.ReactNode
	/** Avatar / app icon before the title */
	leading?: React.ReactNode
	actions?: React.ReactNode
	/** Renders a ghost "Back" link to this href (`/…` → router Link) */
	back?: string
	level?: HeadingLevel
}

export const PageHeader = createComponent<HTMLElement, PageHeaderProps>(
	'PageHeader',
	({ className, title, subtitle, leading, actions, back, level = 1, ...props }, ref) => {
		const { t } = useLibTranslation()
		const backClass = 'c-button ghost align-self-start'
		const backContent = (
			<>
				<IcBack aria-hidden="true" />
				{t('Back')}
			</>
		)

		return (
			<header ref={ref} className={mergeClasses('c-page-header', className)} {...props}>
				{back != null &&
					(back.startsWith('/') ? (
						<Link to={back} className={backClass}>
							{backContent}
						</Link>
					) : (
						<a href={back} className={backClass}>
							{backContent}
						</a>
					))}
				<HBox gap={2} align="center" wrap>
					{leading}
					<VBox fill>
						<Heading level={level} className="m-0">
							{title}
						</Heading>
						{subtitle != null && (
							// div, not p: subtitles may hold block content (an HBox with a button)
							<Text as="div" emphasis="muted" className="m-0">
								{subtitle}
							</Text>
						)}
					</VBox>
					{actions != null && <HBox gap={1}>{actions}</HBox>}
				</HBox>
			</header>
		)
	}
)

// vim: ts=4
