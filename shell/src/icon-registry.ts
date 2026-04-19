// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as React from 'react'
import {
	LuBookOpen,
	LuClipboardList,
	LuContact,
	LuEye,
	LuFile,
	LuFileText,
	LuFingerprint,
	LuImage,
	LuList,
	LuListChecks,
	LuMap,
	LuMessagesSquare,
	LuPenLine,
	LuPresentation,
	LuScan,
	LuServerCog,
	LuSettings,
	LuTable,
	LuUser,
	LuUsers
} from 'react-icons/lu'

const iconRegistry: Record<string, React.ComponentType> = {
	'book-open': LuBookOpen,
	'clipboard-list': LuClipboardList,
	contact: LuContact,
	eye: LuEye,
	file: LuFile,
	'file-text': LuFileText,
	fingerprint: LuFingerprint,
	image: LuImage,
	list: LuList,
	'list-checks': LuListChecks,
	map: LuMap,
	'messages-square': LuMessagesSquare,
	'pen-line': LuPenLine,
	presentation: LuPresentation,
	scan: LuScan,
	'server-cog': LuServerCog,
	settings: LuSettings,
	table: LuTable,
	user: LuUser,
	users: LuUsers
}

export function getIcon(name?: string): React.ComponentType | undefined {
	if (!name) return undefined
	return iconRegistry[name]
}

// vim: ts=4
