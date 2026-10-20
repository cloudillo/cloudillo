// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The shell's `rooms` section: the directory and each room's home. */

import * as React from 'react'
import { Navigate, Route, useParams } from 'react-router-dom'

import { useCtx } from '../context/index.js'
import { feedPath, filesPath } from '../routes.js'
import { RoomsDirectory } from './directory.js'
import { RoomsLayout } from './layout.js'
import { RoomHome } from './room-home.js'

/** Old `rooms/:name/posts` URL → the room-scoped feed. */
function RoomPostsRedirect() {
	const ctx = useCtx()
	const { name = '' } = useParams()
	return <Navigate to={feedPath(ctx.base, undefined, { room: name })} replace />
}

/** Old `rooms/:name/files` URL → the room in Files. */
function RoomFilesRedirect() {
	const ctx = useCtx()
	const { name = '' } = useParams()
	return <Navigate to={filesPath(ctx.base, { room: name })} replace />
}

/** Called, never rendered — see `ShellRoutes` in `layout.tsx`. Guest-visible. */
export function roomsRoutes() {
	return (
		<>
			{/* Outside the layout, so the redirects don't flash the rail */}
			<Route path="rooms/:name/posts" element={<RoomPostsRedirect />} />
			<Route path="rooms/:name/files" element={<RoomFilesRedirect />} />
			<Route path="rooms" element={<RoomsLayout />}>
				<Route index element={<RoomsDirectory />} />
				<Route path=":name/:tab?" element={<RoomHome />} />
			</Route>
		</>
	)
}

// vim: ts=4
