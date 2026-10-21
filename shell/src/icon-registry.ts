// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { IcCommunity, IcPagillo, IcSettings } from '@cloudillo/react'
import type * as React from 'react'

import {
	IcCalcillo,
	IcCalendar,
	IcContacts,
	IcFeed,
	IcFilesApp,
	IcFormillo,
	IcGallery,
	IcIdeallo,
	IcIdp,
	IcMapillo,
	IcMessages,
	IcNotillo,
	IcPeople,
	IcPrezillo,
	IcQuillo,
	IcRoom,
	IcScanillo,
	IcServer,
	IcTaskillo,
	IcViewer
} from './icons.js'

// Keyed by concept key (concept id without `Ic`, kebab case). Only app/menu
// concepts: file-kind concepts (`file`, `image`, …) would shadow the legacy keys below.
const iconRegistry: Record<string, React.ComponentType> = {
	calcillo: IcCalcillo,
	calendar: IcCalendar,
	community: IcCommunity,
	contacts: IcContacts,
	feed: IcFeed,
	files: IcFilesApp,
	formillo: IcFormillo,
	gallery: IcGallery,
	ideallo: IcIdeallo,
	idp: IcIdp,
	mapillo: IcMapillo,
	messages: IcMessages,
	notillo: IcNotillo,
	pagillo: IcPagillo,
	people: IcPeople,
	prezillo: IcPrezillo,
	quillo: IcQuillo,
	room: IcRoom,
	scanillo: IcScanillo,
	server: IcServer,
	settings: IcSettings,
	taskillo: IcTaskillo,
	viewer: IcViewer
}

// Old Lucide manifest keys → concept key, so existing app manifests keep working.
const legacyIconKeys: Record<string, string> = {
	'book-open': 'notillo',
	'clipboard-list': 'formillo',
	contact: 'contacts',
	eye: 'viewer',
	file: 'files',
	'file-text': 'quillo',
	fingerprint: 'idp',
	image: 'gallery',
	list: 'feed',
	'list-checks': 'taskillo',
	map: 'mapillo',
	'messages-square': 'messages',
	'pen-line': 'ideallo',
	presentation: 'prezillo',
	scan: 'scanillo',
	'server-cog': 'server',
	table: 'calcillo',
	user: 'people',
	users: 'community'
}

export function getIcon(name?: string): React.ComponentType | undefined {
	if (!name) return undefined
	if (Object.hasOwn(iconRegistry, name)) return iconRegistry[name]
	return Object.hasOwn(legacyIconKeys, name) ? iconRegistry[legacyIconKeys[name]] : undefined
}

// vim: ts=4
