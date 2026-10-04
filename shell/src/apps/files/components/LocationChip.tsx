// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { parseChannel, Tag, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useContextName, useCtx, useCurrentContextIdTag } from '../../../context/index.js'
import { ctxBase, filesPath } from '../../../routes.js'
import { navSearch } from '../atoms.js'
import { channelTarget } from '../audience.js'
import type { File } from '../types.js'
import { MANAGED_FOLDER_ID, TRASH_FOLDER_ID } from '../types.js'

/** `~board › Minutes` / `<context> › Events`. `driveOnly` drops the folder (Trash, Managed). */
export function locationText(
	contextName: string,
	channel: string | undefined,
	parentName: string | undefined,
	driveOnly: boolean
): string {
	const drive = channel ? `~${parseChannel(channel).name}` : contextName
	return !driveOnly && parentName ? `${drive} › ${parentName}` : drive
}

export interface LocationChipProps {
	file: File
	/** Show the drive only and open its root (the row's folder is unknown or not a place). */
	driveOnly?: boolean
}

/** Where a row lives, in cross-drive views: click opens that folder in its drive. */
export function LocationChip({ file, driveOnly }: LocationChipProps) {
	const navigate = useNavigate()
	const [auth] = useAuth()
	const { base } = useCtx()
	const contextIdTag = useCurrentContextIdTag()
	const contextName = useContextName()
	const [searchParams] = useSearchParams()
	const remoteOwner = searchParams.get('remoteOwner')
	const shareRoot = searchParams.get('shareRoot')

	// Trash keeps no original folder; Managed rows sit under a virtual parent.
	const parentId =
		driveOnly ||
		!file.parentId ||
		file.parentId === '__root__' ||
		file.parentId === TRASH_FOLDER_ID ||
		file.parentId === MANAGED_FOLDER_ID
			? undefined
			: file.parentId
	// A `@tenant~name` channel names its own context, which may not be the one browsed
	const { tenant, drive } = channelTarget(file.channel, contextIdTag)
	const target = tenant ? ctxBase(tenant, auth?.idTag) : base

	function handleClick(evt: React.MouseEvent<HTMLElement>) {
		evt.stopPropagation()
		// Plain URL navigation, so the Files nav stack skips this hop (browser Back works)
		if (remoteOwner) {
			// Rows came from the remote owner: stay there
			navigate({
				search: navSearch({ parentId: parentId ?? shareRoot, remoteOwner, shareRoot })
			})
		} else {
			navigate(filesPath(target, { ...(drive && { drive }), ...(parentId && { parentId }) }))
		}
	}

	return (
		<Tag size="sm" onClick={handleClick}>
			{locationText(contextName, file.channel, parentId && file.parentName, !parentId)}
		</Tag>
	)
}

// vim: ts=4
