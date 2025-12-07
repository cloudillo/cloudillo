// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { MessageBusAdapter } from '@cloudillo/server/types/message-bus-adapter'

type Handler = (idTag: string, msgType: string, payload: any) => Promise<boolean>

const online: Record<string, Record<string, Handler>> = {}
const offline: Record<string, Handler> = {}

async function subscribeOnline(
	subsId: string,
	idTag: string,
	callback: (idTag: string, msgType: string, payload: any) => Promise<boolean>
) {
	const identityOnline = online[idTag] || (online[idTag] = {})
	identityOnline[subsId] = callback
}

function unsubscribeOnline(subsId: string, idTag: string) {
	delete online[idTag]?.[subsId]
}

async function subscribeOffline(
	subsId: string,
	callback: (idTag: string, msgType: string, payload: any) => Promise<boolean>
) {
	offline[subsId] = callback
}

function unsubscribeOffline(subsId: string) {
	delete offline[subsId]
}

async function sendMessage(idTag: string, msgType: string, payload: any) {
	const handlers = Object.values(online[idTag] || {})

	if (handlers.length) {
		console.log('    online')
		for (const handler of Object.values(handlers)) await handler(idTag, msgType, payload)
	} else {
		console.log('    offline')
		for (const handler of Object.values(offline)) await handler(idTag, msgType, payload)
	}
}

export async function init(): Promise<MessageBusAdapter> {
	return {
		subscribeOnline,
		unsubscribeOnline,
		subscribeOffline,
		unsubscribeOffline,
		sendMessage
	}
}

// vim: ts=4
