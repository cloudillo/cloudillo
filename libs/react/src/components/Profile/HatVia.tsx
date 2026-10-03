// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ProfileInfo } from '@cloudillo/types'
import * as React from 'react'
import { LuUsers as IcCommunity } from 'react-icons/lu'

import { LibTrans } from '../../i18n.js'
import { mergeClasses } from '../utils.js'
import { ProfilePicture } from './ProfilePicture.js'

export interface HatViaProps {
	className?: string
	/** The community the actor speaks for; a bare idTag when its profile is unknown. */
	hat?: ProfileInfo | string | null
	/** The actor's name, when it belongs in the same sentence ("Alice via ▣ A").
	 *  Omit it where the name already sits on its own line. */
	name?: React.ReactNode
	/** Tenant serving the hat community's picture; defaults to the signed-in user. */
	srcTag?: string
}

/** The avatar ring class marking an actor who wears a hat. */
export const hatRingClass = (hat: unknown) => (hat ? 'c-hat-ring' : undefined)

/** The hat attribution of an actor: "via ▣ Community", one translatable sentence.
 *  Without a hat it is just `name`. */
export function HatVia({ className, hat, name, srcTag }: HatViaProps) {
	if (!hat) return name ?? null
	const profile = typeof hat === 'string' ? { idTag: hat } : hat
	const hatEl = (
		<span className="c-hat-via__hat">
			<IcCommunity className="c-hat-via__icon" aria-hidden />
			<ProfilePicture
				className="c-hat-via__avatar"
				profile={profile}
				size="xs"
				srcTag={srcTag}
			/>
			<span className="c-hat-via__name">{profile.name ?? profile.idTag}</span>
		</span>
	)

	// Children are the fallback when i18n is not initialized.
	return (
		<span className={mergeClasses('c-hat-via', className)}>
			{name === undefined ? (
				<LibTrans i18nKey="via <hat/>" components={{ hat: hatEl }}>
					via {hatEl}
				</LibTrans>
			) : (
				<LibTrans
					i18nKey="<name/> via <hat/>"
					components={{
						name: <span className="c-hat-via__actor">{name}</span>,
						hat: hatEl
					}}
				>
					<span className="c-hat-via__actor">{name}</span> via {hatEl}
				</LibTrans>
			)}
		</span>
	)
}

// vim: ts=4
