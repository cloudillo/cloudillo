// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Message Registry with Access Control Rules
 */

import * as T from '@symbion/runtype'

import {
	type CloudilloMessage,
	type MessageDirection,
	type MessageType,
	PROTOCOL_VERSION,
	tAppErrorNotify,
	tAppReadyNotify,
	tAppTitlePush,
	tAuthInitPush,
	tAuthInitReq,
	tAuthInitRes,
	tAuthTokenPush,
	tAuthTokenRefreshReq,
	tAuthTokenRefreshRes,
	tCameraCaptureAck,
	tCameraCaptureReq,
	tCameraCaptureResultPush,
	tCameraOverlayUpdate,
	tCameraPreviewFrame,
	tCameraPreviewStart,
	tCameraPreviewStop,
	tCrdtCacheAppendReq,
	tCrdtCacheCompactReq,
	tCrdtCacheReadReq,
	tCrdtCacheRes,
	tCrdtClientIdReq,
	tCrdtClientIdRes,
	tDocInfoPush,
	tDocInfoReq,
	tDocInfoRes,
	tDocPickAck,
	tDocPickReq,
	tDocPickResultPush,
	tDocRenameReq,
	tDocRenameRes,
	tEmbedOpenReq,
	tEmbedOpenRes,
	tEmbedViewStatePush,
	tEmbedViewStateSet,
	tFeedPostReq,
	tFeedPostRes,
	tImportCompleteNotify,
	tImportDataPush,
	tMediaFileResolvedPush,
	tMediaPickAck,
	tMediaPickReq,
	tMediaPickRes,
	tMediaPickResultPush,
	tSensorCompassPush,
	tSensorCompassSub,
	tSensorCompassSubRes,
	tSettingsGetReq,
	tSettingsGetRes,
	tSettingsListReq,
	tSettingsListRes,
	tSettingsSetReq,
	tSettingsSetRes,
	tShareCreateAck,
	tShareCreateReq,
	tShareCreateResultPush,
	tSiteMountReq,
	tSiteMountRes,
	tSitePublishReq,
	tSitePublishRes,
	tStorageOpReq,
	tStorageOpRes,
	tThemeUpdate
} from './types.js'

// ============================================
// ACCESS RULE TYPES
// ============================================

export type MessageAccessRule = readonly [
	direction: MessageDirection,
	requiresAuth: boolean,
	validator: unknown
]

// ============================================
// MESSAGE REGISTRY
// ============================================

export const MESSAGE_REGISTRY: Record<MessageType, MessageAccessRule> = {
	'auth:init.req': ['app>shell', false, tAuthInitReq],
	'auth:init.res': ['shell>app', false, tAuthInitRes],
	'auth:init.push': ['shell>app', false, tAuthInitPush],
	'auth:token.refresh.req': ['app>shell', true, tAuthTokenRefreshReq],
	'auth:token.refresh.res': ['shell>app', false, tAuthTokenRefreshRes],
	'auth:token.push': ['shell>app', false, tAuthTokenPush],
	'app:ready.notify': ['app>shell', false, tAppReadyNotify],
	'app:error.notify': ['app>shell', false, tAppErrorNotify],
	'app:title.push': ['app>shell', false, tAppTitlePush],
	'storage:op.req': ['app>shell', true, tStorageOpReq],
	'storage:op.res': ['shell>app', false, tStorageOpRes],
	'media:pick.req': ['app>shell', true, tMediaPickReq],
	'media:pick.ack': ['shell>app', false, tMediaPickAck],
	'media:pick.result': ['shell>app', false, tMediaPickResultPush],
	'media:pick.res': ['shell>app', false, tMediaPickRes], // Deprecated - kept for backwards compatibility
	'media:file.resolved': ['shell>app', false, tMediaFileResolvedPush],
	'doc:pick.req': ['app>shell', true, tDocPickReq],
	'doc:pick.ack': ['shell>app', false, tDocPickAck],
	'doc:pick.result': ['shell>app', false, tDocPickResultPush],
	'doc:info.req': ['app>shell', true, tDocInfoReq],
	'doc:info.res': ['shell>app', false, tDocInfoRes],
	'doc:info.push': ['shell>app', false, tDocInfoPush],
	'doc:rename.req': ['app>shell', true, tDocRenameReq],
	'doc:rename.res': ['shell>app', false, tDocRenameRes],
	'theme:update': ['shell>app', false, tThemeUpdate],
	'embed:open.req': ['app>shell', true, tEmbedOpenReq],
	'embed:open.res': ['shell>app', false, tEmbedOpenRes],
	'embed:viewstate.push': ['app>shell', false, tEmbedViewStatePush],
	'embed:viewstate.set': ['shell>app', false, tEmbedViewStateSet],
	'settings:get.req': ['app>shell', true, tSettingsGetReq],
	'settings:get.res': ['shell>app', false, tSettingsGetRes],
	'settings:set.req': ['app>shell', true, tSettingsSetReq],
	'settings:set.res': ['shell>app', false, tSettingsSetRes],
	'settings:list.req': ['app>shell', true, tSettingsListReq],
	'settings:list.res': ['shell>app', false, tSettingsListRes],
	'crdt:clientid.req': ['app>shell', true, tCrdtClientIdReq],
	'crdt:clientid.res': ['shell>app', false, tCrdtClientIdRes],
	'crdt:cache.append.req': ['app>shell', true, tCrdtCacheAppendReq],
	'crdt:cache.read.req': ['app>shell', true, tCrdtCacheReadReq],
	'crdt:cache.compact.req': ['app>shell', true, tCrdtCacheCompactReq],
	'crdt:cache.res': ['shell>app', false, tCrdtCacheRes],
	'sensor:compass.sub': ['app>shell', false, tSensorCompassSub],
	'sensor:compass.sub.res': ['shell>app', false, tSensorCompassSubRes],
	'sensor:compass.push': ['shell>app', false, tSensorCompassPush],
	'camera:capture.req': ['app>shell', true, tCameraCaptureReq],
	'camera:capture.ack': ['shell>app', false, tCameraCaptureAck],
	'camera:capture.result': ['shell>app', false, tCameraCaptureResultPush],
	'camera:preview.start': ['app>shell', false, tCameraPreviewStart],
	'camera:preview.stop': ['app>shell', false, tCameraPreviewStop],
	'camera:preview.frame': ['shell>app', false, tCameraPreviewFrame],
	'camera:overlay.update': ['app>shell', false, tCameraOverlayUpdate],
	'share:create.req': ['app>shell', true, tShareCreateReq],
	'share:create.ack': ['shell>app', false, tShareCreateAck],
	'share:create.result': ['shell>app', false, tShareCreateResultPush],
	'site:publish.req': ['app>shell', true, tSitePublishReq],
	'site:publish.res': ['shell>app', false, tSitePublishRes],
	'site:mount.req': ['app>shell', true, tSiteMountReq],
	'site:mount.res': ['shell>app', false, tSiteMountRes],
	'feed:post.req': ['app>shell', true, tFeedPostReq],
	'feed:post.res': ['shell>app', false, tFeedPostRes],
	'import:data.push': ['shell>app', false, tImportDataPush],
	'import:complete.notify': ['app>shell', true, tImportCompleteNotify]
}

// ============================================
// VALIDATION
// ============================================

export interface ValidatedMessage {
	message: CloudilloMessage
	rule: MessageAccessRule
}

/** Quick check if data looks like a Cloudillo message */
function isCloudilloMessage(data: unknown): boolean {
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
	if (rule[0] !== expectedDirection) return undefined

	const result = T.decode(rule[2] as T.Type<CloudilloMessage>, data)
	if (!T.isOk(result)) return undefined

	return { message: result.ok as CloudilloMessage, rule }
}

// vim: ts=4
