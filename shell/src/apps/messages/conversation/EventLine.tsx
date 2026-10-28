// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Meta } from '@cloudillo/react'
import type { ActionView, Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface EventLineProps {
	event: ActionView
	convId: string | undefined
	/** A member SUBS id → its member (a role change and a kick name the member's SUBS) */
	memberOf: (subsId: string) => Profile | undefined
}

// What shows is what the viewer's home node holds: an invitation may live only on the
// host and the inviter's node. A community group's kick is a reject of the member's SUBS
// (a status flip, no action row), so it draws nothing.
function eventText(
	{ event, convId, memberOf }: EventLineProps,
	t: (key: string, opts?: Record<string, string>) => string
): string | undefined {
	const actor = event.issuer.name || event.issuer.idTag
	const fallback = t('a member')
	const name = (p: Profile | undefined) => p?.name || p?.idTag || fallback
	const member = () => name(event.subject ? memberOf(event.subject) : undefined)
	const sub = event.subType
	switch (event.type as string) {
		case 'CONV':
			return sub
				? t('{{actor}} updated the group settings', { actor })
				: t('{{actor}} created the group', { actor })
		case 'SUBS':
			if (!sub) return t('{{actor}} joined', { actor })
			if (sub === 'DEL')
				return event.subject === convId
					? t('{{actor}} left', { actor })
					: t('{{actor}} removed {{member}}', { actor, member: member() })
			if (sub === 'ROLE') {
				// The new role is the SUBS:ROLE's own content, not `x.role` (`getActionRole`).
				const role = (event.content as { role?: string } | undefined)?.role
				const labels: Record<string, string> = {
					admin: t('Admin'),
					moderator: t('Moderator'),
					member: t('Member'),
					observer: t('Observer')
				}
				return t("{{actor}} changed {{member}}'s role to {{role}}", {
					actor,
					member: member(),
					role: (role && labels[role]) || role || fallback
				})
			}
			return undefined
		case 'INVT':
			return sub
				? t("{{actor}} revoked {{name}}'s invitation", {
						actor,
						name: name(event.audience)
					})
				: t('{{actor}} invited {{name}}', { actor, name: name(event.audience) })
		case 'PIN':
			return sub
				? t('{{actor}} unpinned a message', { actor })
				: t('{{actor}} pinned a message', { actor })
		default:
			return undefined
	}
}

/** A group change, as a muted centred line in the timeline. */
export function EventLine(props: EventLineProps) {
	const { t } = useTranslation()
	const text = eventText(props, t)
	return text ? <Meta className="d-block text-center my-1">{text}</Meta> : null
}

// vim: ts=4
