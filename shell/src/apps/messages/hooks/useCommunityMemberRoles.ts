// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi } from '@cloudillo/react'
import * as React from 'react'

import type { ConversationMember } from '../types.js'

/** Community roles of a community group's active members (idTag → roles); empty otherwise. */
export function useCommunityMemberRoles(
	community: string | undefined,
	members: ConversationMember[] | undefined
): Map<string, string[]> {
	const { api } = useApi(community)
	const [roles, setRoles] = React.useState<Map<string, string[]>>(new Map())

	// One profile read per member on the community node; a batched roles query
	// when groups get large.
	const activeTags = (members ?? [])
		.filter((m) => m.status === 'active')
		.map((m) => m.profile.idTag)
		.join(',')
	React.useEffect(() => {
		if (!api || !community || !activeTags) {
			setRoles(new Map())
			return
		}
		let live = true
		Promise.all(
			activeTags.split(',').map((idTag) =>
				api.profiles
					.get(idTag)
					.then((p) => [idTag, p?.roles ?? []] as [string, string[]])
					.catch(() => [idTag, []] as [string, string[]])
			)
		).then((entries) => {
			if (live) setRoles(new Map(entries))
		})
		return () => {
			live = false
		}
	}, [api, community, activeTags])

	return roles
}

// vim: ts=4
