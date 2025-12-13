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
 * Message Registry with Access Control Rules
 */

import * as T from '@symbion/runtype'

import {
	PROTOCOL_VERSION,
	MessageDirection,
	MessageType,
	CloudilloMessage,
	tAuthInitReq,
	tAuthInitRes,
	tAuthInitPush,
	tAuthTokenRefreshReq,
	tAuthTokenRefreshRes,
	tAuthTokenPush,
	tStorageOpReq,
	tStorageOpRes,
	tSwTokenSet,
	tSwTokenClear,
	tSwApiKeySet,
	tSwApiKeyGetReq,
	tSwApiKeyGetRes,
	tSwApiKeyDel
} from './types.js'

// ============================================
// ACCESS RULE TYPES
// ============================================

export interface MessageAccessRule {
	directions: MessageDirection[]
	requiresAuth: boolean
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	validator: any
}

// ============================================
// MESSAGE REGISTRY
// ============================================

export const MESSAGE_REGISTRY: Record<MessageType, MessageAccessRule> = {
	'auth:init.req': {
		directions: ['app>shell'],
		requiresAuth: false,
		validator: tAuthInitReq
	},
	'auth:init.res': {
		directions: ['shell>app'],
		requiresAuth: false,
		validator: tAuthInitRes
	},
	'auth:init.push': {
		directions: ['shell>app'],
		requiresAuth: false,
		validator: tAuthInitPush
	},
	'auth:token.refresh.req': {
		directions: ['app>shell'],
		requiresAuth: true,
		validator: tAuthTokenRefreshReq
	},
	'auth:token.refresh.res': {
		directions: ['shell>app'],
		requiresAuth: false,
		validator: tAuthTokenRefreshRes
	},
	'auth:token.push': {
		directions: ['shell>app'],
		requiresAuth: false,
		validator: tAuthTokenPush
	},
	'storage:op.req': {
		directions: ['app>shell'],
		requiresAuth: true,
		validator: tStorageOpReq
	},
	'storage:op.res': {
		directions: ['shell>app'],
		requiresAuth: false,
		validator: tStorageOpRes
	},
	'sw:token.set': {
		directions: ['shell>sw'],
		requiresAuth: false,
		validator: tSwTokenSet
	},
	'sw:token.clear': {
		directions: ['shell>sw'],
		requiresAuth: false,
		validator: tSwTokenClear
	},
	'sw:apikey.set': {
		directions: ['shell>sw'],
		requiresAuth: false,
		validator: tSwApiKeySet
	},
	'sw:apikey.get.req': {
		directions: ['shell>sw'],
		requiresAuth: false,
		validator: tSwApiKeyGetReq
	},
	'sw:apikey.get.res': {
		directions: ['sw>shell'],
		requiresAuth: false,
		validator: tSwApiKeyGetRes
	},
	'sw:apikey.del': {
		directions: ['shell>sw'],
		requiresAuth: false,
		validator: tSwApiKeyDel
	}
}

// ============================================
// VALIDATION
// ============================================

export interface ValidatedMessage {
	message: CloudilloMessage
	rule: MessageAccessRule
}

/**
 * Quick check if data looks like a Cloudillo message
 */
export function isCloudilloMessage(data: unknown): boolean {
	return (
		data !== null &&
		typeof data === 'object' &&
		(data as Record<string, unknown>).cloudillo === true
	)
}

/**
 * Validate a message against the registry
 * Returns the validated message and rule, or undefined if invalid
 */
export function validateMessage(
	data: unknown,
	expectedDirection: MessageDirection
): ValidatedMessage | undefined {
	if (!isCloudilloMessage(data)) return undefined

	const msg = data as Record<string, unknown>
	if (msg.v !== PROTOCOL_VERSION) return undefined

	const type = msg.type as MessageType
	if (typeof type !== 'string') return undefined

	const rule = MESSAGE_REGISTRY[type]
	if (!rule) return undefined
	if (!rule.directions.includes(expectedDirection)) return undefined

	const result = T.decode(rule.validator, data)
	if (!T.isOk(result)) return undefined

	return { message: result.ok as CloudilloMessage, rule }
}

// vim: ts=4
