// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Shell-side person card actions: navigation for "Open profile" / "Message", the
 * `ProfileContextMenu` for "More", and the target of apps' `person:open.push`.
 */

import {
	type PersonActions,
	PersonActionsContext,
	type ProfileNode,
	resetProfileCache,
	useAuth,
	useProfile
} from '@cloudillo/react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { setPersonOpenCallback } from '../message-bus/handlers/person.js'
import { messagesPath, profilePath } from '../routes.js'
import { useCtx } from './ctx.js'
import { ProfileContextMenu } from './profile-context-menu.js'

interface MoreState {
	idTag: string
	position: { x: number; y: number }
}

function PersonMoreMenu({
	state,
	node,
	onClose
}: {
	state: MoreState
	node: ProfileNode
	onClose: () => void
}) {
	const profile = useProfile(state.idTag, node)
	return (
		<ProfileContextMenu
			target={{ idTag: state.idTag, name: profile?.name || state.idTag, type: 'person' }}
			position={state.position}
			onClose={onClose}
		/>
	)
}

export function PersonActionsProvider({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate()
	const { base } = useCtx()
	const [auth] = useAuth()
	const authTag = auth?.idTag
	const [more, setMore] = React.useState<MoreState | null>(null)

	// An app's person card (person:open.push) navigates the shell
	React.useEffect(() => {
		setPersonOpenCallback((idTag, target) =>
			navigate(target === 'messages' ? messagesPath(base, idTag) : profilePath(base, idTag))
		)
		return () => {
			setPersonOpenCallback(null)
		}
	}, [navigate, base])

	// With the home token: /profiles/batch refuses an unauthenticated request, and
	// badges are served to the authenticated owner only. The cache is keyed by tag,
	// so a token rotation re-renders consumers without refetching.
	const authToken = auth?.token
	// Badges are served per viewer: a new identity must not see the previous one's
	// cache, nor a profile fetched before the token existed (the key has no token).
	const resetKey = `${authTag}|${!!authToken}`
	const prevKey = React.useRef(resetKey)
	// Runs before children's passive effects: the generation bump can't discard their first batch.
	React.useLayoutEffect(() => {
		if (prevKey.current === resetKey) return
		prevKey.current = resetKey
		resetProfileCache()
	}, [resetKey])
	const node = React.useMemo<ProfileNode>(
		() => ({ tag: authTag, token: authToken }),
		[authTag, authToken]
	)

	const value = React.useMemo<PersonActions>(
		() => ({
			node,
			openProfile: (idTag) => navigate(profilePath(base, idTag)),
			message: (idTag) => navigate(messagesPath(base, idTag)),
			more: (idTag, anchor) => {
				const rect = anchor.getBoundingClientRect()
				setMore({ idTag, position: { x: rect.left, y: rect.bottom } })
			}
		}),
		[node, navigate, base]
	)

	return (
		<PersonActionsContext.Provider value={value}>
			{children}
			{more && <PersonMoreMenu state={more} node={node} onClose={() => setMore(null)} />}
		</PersonActionsContext.Provider>
	)
}

// vim: ts=4
