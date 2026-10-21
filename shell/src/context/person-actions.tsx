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

	const node = React.useMemo<ProfileNode>(() => ({ tag: authTag }), [authTag])

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
