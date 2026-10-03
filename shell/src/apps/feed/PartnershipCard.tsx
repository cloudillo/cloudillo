// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Card, HBox, ProfilePicture, Text, TimeFormat, VBox } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { Trans } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useCtx } from '../../context/index.js'
import { profilePath } from '../../routes.js'

export interface PartnershipCardProps {
	/** A PTNR action: issuer = community A, `subject` = `@<B idTag>`. */
	action: ActionView
	className?: string
}

/** The partner (B) of a PTNR action, falling back to the bare idTag. */
function partnerOf(action: ActionView) {
	return action.subjectProfile ?? { idTag: (action.subject ?? '').replace(/^@/, '') }
}

/**
 * Both sides of a partnership emit a PTNR, so a follower of both would see the
 * same news twice. Keeps the first PTNR of each unordered {A, B} pair.
 */
export function collapsePartnerships<T extends ActionView>(list: T[]): T[] {
	const seen = new Set<string>()
	return list.filter((a) => {
		if (a.type !== 'PTNR') return true
		const key = [a.issuer.idTag, partnerOf(a).idTag].sort().join('|')
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

/** Feed card: "<A> and <B> are now partners". */
export function PartnershipCard({ action, className }: PartnershipCardProps) {
	const urlContext = useCtx().base
	const a = action.issuer
	const b = partnerOf(action)

	return (
		<Card className={className}>
			<VBox gap={2}>
				<HBox align="center" gap={2}>
					<Link to={profilePath(urlContext, a.idTag)}>
						<ProfilePicture profile={a} small />
					</Link>
					<Link to={profilePath(urlContext, b.idTag)}>
						<ProfilePicture profile={b} small />
					</Link>
					<Text as="div" className="flex-fill w-min-0">
						<Trans
							i18nKey="<0>{{a}}</0> and <1>{{b}}</1> are now partners"
							values={{ a: a.name || a.idTag, b: b.name || b.idTag }}
							components={[
								<Link
									key="a"
									to={profilePath(urlContext, a.idTag)}
									className="font-semibold"
								/>,
								<Link
									key="b"
									to={profilePath(urlContext, b.idTag)}
									className="font-semibold"
								/>
							]}
						/>
					</Text>
					<TimeFormat time={action.createdAt} />
				</HBox>
			</VBox>
		</Card>
	)
}

// vim: ts=4
