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

const TAG_FORBIDDEN_CHARS = [' ', ',', '#', '\t', '\n']

import { HttpError} from 'koa'

import { Router } from './index.js'
import { checkPermMW as perm, checkPermProfileMW as permProfile } from './perm.js'

import * as auth from './auth/handlers.js'
import * as action from './action/handlers.js'
import * as file from './file/handlers.js'
import * as ref from './ref/handlers.js'
import * as notification from './notification/handlers.js'
import * as profile from './profile/handlers.js'
import * as settings from './settings/handlers.js'
import * as database from './database/handlers.js'

export async function init(router: Router) {
	/* Auth */
	router.post('/auth/login', auth.postLogin)
	router.post('/auth/logout', auth.postLogout)
	router.post('/auth/register', auth.postRegister)
	router.post('/auth/register-verify', auth.postRegisterVerify)
	router.get('/auth/login-token', auth.getLoginToken)
	router.get('/auth/access-token', auth.getAccessToken)
	router.get('/auth/proxy-token', auth.getProxyToken)

	router.get('/.well-known/acme-challenge/:token', auth.getAcmeChallengeResponse)

	router.post('/auth/password', perm('A'), auth.postSetPassword)
	router.post('/auth/password-req', auth.postResetPasswordRequest)

	router.get('/auth/wa/register-req', perm('A'), auth.getWebauthnRegisterRequest)
	router.post('/auth/wa/register', perm('A'), auth.postWebauthnRegister)
	router.delete('/auth/wa/reg/:keyId', perm('A'), auth.deleteWebauthnDeleteCredential)
	router.get('/auth/wa/login-req', auth.getWebauthnLoginRequest)
	router.post('/auth/wa/login', auth.postWebauthnLogin)

	router.get('/auth/vapid', perm('A'), auth.getVapidPublicKey)

	/* Actions */
	// FIXME perm disabled
	//router.get('/action', perm('R'), action.listActions)
	router.get('/action', action.listActions)
	router.get('/action/tokens', action.listActionTokens)
	router.post('/action', perm('A'), action.postAction)
	router.post('/action/:actionId/accept', perm('A'), action.postActionAccept)
	router.post('/action/:actionId/reject', perm('A'), action.postActionReject)
	router.post('/action/:actionId/stat', perm('A'), action.postActionStat)
	router.post('/inbox', action.postInboundAction)

	/* Documents */
	router.get('/store', permProfile('R'), file.listFiles)
	router.post('/store', perm('A'), file.createFile)
	router.post('/store/:preset/:fileName', perm('A'), file.postFile)
	// FIXME perm disabled
	//router.get('/store/:fileId{/:label}', perm('R', 'fileId'), file.getFile)
	router.get('/store/:fileId/meta', file.getFileMeta)
	//router.get('/store/:fileId{/:label}', file.getFile)
	router.get('/store/:fileId/:label?', file.getFile)
	router.patch('/store/:fileId', perm('W', 'fileId'), file.patchFile)
	router.delete('/store/:fileId', perm('A', 'fileId'), file.deleteFile)
	router.put('/store/:fileId/tag/:tag', perm('A', 'fileId'), file.putFileTag)
	router.delete('/store/:fileId/tag/:tag', perm('A', 'fileId'), file.deleteFileTag)
	router.get('/tag', perm('A'), file.listTags)
	//router.get('/store/:id', meta.getStore)

	/* Refs */
	router.get('/ref', perm('A'), ref.listRefs)
	router.get('/ref/:refId', ref.getRef)
	router.post('/ref', perm('A'), ref.postRef)
	router.delete('/ref/:refId', perm('A'), ref.deleteRef)

	/* Notification */
	router.post('/notification/subscription', perm('A'), notification.postNotificationSubscription)

	/* Own profile */
	router.get('/me', profile.getOwnProfile)
	router.get('/me/keys', profile.getOwnProfileKeys)
	router.get('/me/full', profile.getOwnProfileFull)
	router.patch('/me', perm('A'), profile.patchOwnProfile)
	router.put('/me/image', perm('A'), profile.putOwnProfileImage)
	router.put('/me/cover', perm('A'), profile.putOwnCoverImage)
	// users/communities
	router.get('/profile', permProfile('R'), profile.listProfiles)
	router.get('/profile/:idTag', perm('R'), profile.getProfile)
	router.patch('/profile/:idTag', perm('A'), profile.patchProfile)

	/* Settings */
	router.get('/settings', perm('A'), settings.listSettings)
	router.get('/settings/:name', perm('A'), settings.getSetting)
	router.put('/settings/:name', perm('A'), settings.putSetting)

	/* Database */
	router.get('/db/:fileId', perm('R', 'fileId'), database.listData)
	router.post('/db/:fileId', perm('W', 'fileId'), database.postData)
	router.get('/db/:fileId/:dataId', perm('R', 'fileId'), database.getData)
	//router.delete('/dn/:dbId/:dataId', deleteData)
}

// vim: ts=4
