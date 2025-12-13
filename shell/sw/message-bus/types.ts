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

/**
 * Service Worker Message Types
 *
 * These types mirror the ones in libs/base/src/message-bus/types.ts
 * but are defined separately to avoid bundling issues in the SW context.
 */

// Protocol version - must match libs/base
export const PROTOCOL_VERSION = 1

// ============================================
// MESSAGE INTERFACES
// ============================================

/**
 * Base message envelope
 */
export interface MessageEnvelope {
	cloudillo: true
	v: typeof PROTOCOL_VERSION
	type: string
}

/**
 * Shell sets auth token
 */
export interface SwTokenSet extends MessageEnvelope {
	type: 'sw:token.set'
	payload: {
		token: string
	}
}

/**
 * Shell clears auth token (logout)
 */
export interface SwTokenClear extends MessageEnvelope {
	type: 'sw:token.clear'
}

/**
 * Shell stores API key
 */
export interface SwApiKeySet extends MessageEnvelope {
	type: 'sw:apikey.set'
	payload: {
		apiKey: string
	}
}

/**
 * Shell requests API key
 */
export interface SwApiKeyGetReq extends MessageEnvelope {
	type: 'sw:apikey.get.req'
	id: number
}

/**
 * SW responds with API key
 */
export interface SwApiKeyGetRes extends MessageEnvelope {
	type: 'sw:apikey.get.res'
	replyTo: number
	ok: boolean
	data?: {
		apiKey?: string
	}
	error?: string
}

/**
 * Shell deletes API key
 */
export interface SwApiKeyDel extends MessageEnvelope {
	type: 'sw:apikey.del'
}

/**
 * Union of all SW messages from shell
 */
export type SwMessageFromShell =
	| SwTokenSet
	| SwTokenClear
	| SwApiKeySet
	| SwApiKeyGetReq
	| SwApiKeyDel

/**
 * Union of all SW messages to shell
 */
export type SwMessageToShell = SwApiKeyGetRes

/**
 * All SW-related message types
 */
export type SwMessageType = SwMessageFromShell['type'] | SwMessageToShell['type']

// ============================================
// VALIDATION
// ============================================

const SW_MESSAGE_TYPES: readonly SwMessageFromShell['type'][] = [
	'sw:token.set',
	'sw:token.clear',
	'sw:apikey.set',
	'sw:apikey.get.req',
	'sw:apikey.del'
]

/**
 * Validate a SW message from shell
 * Returns the message if valid, undefined otherwise
 */
export function validateSwMessage(data: unknown): SwMessageFromShell | undefined {
	if (!data || typeof data !== 'object') return undefined
	const msg = data as Record<string, unknown>
	if (msg.cloudillo !== true) return undefined
	if (msg.v !== PROTOCOL_VERSION) return undefined
	if (typeof msg.type !== 'string') return undefined
	if (!SW_MESSAGE_TYPES.includes(msg.type as SwMessageFromShell['type'])) return undefined
	return msg as unknown as SwMessageFromShell
}

// vim: ts=4
