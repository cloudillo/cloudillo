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

import { Router } from './index.js'
import { HttpError} from 'koa'

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

	router.post('/auth/passwd', auth.postSetPassword)
	router.post('/auth/passwd-req', auth.postResetPasswordRequest)

	router.get('/auth/wa/register-req', auth.getWebauthnRegisterRequest)
	router.post('/auth/wa/register', auth.postWebauthnRegister)
	router.delete('/auth/wa/reg/:keyId', auth.deleteWebauthnDeleteCredential)
	router.get('/auth/wa/login-req', auth.getWebauthnLoginRequest)
	router.post('/auth/wa/login', auth.postWebauthnLogin)

	router.get('/auth/vapid', auth.getVapidPublicKey)

	/* Actions */
	router.get('/action', action.listActions)
	router.post('/action', action.postAction)
	router.post('/action/:actionId/accept', action.postActionAccept)
	router.post('/action/:actionId/reject', action.postActionReject)
	router.post('/inbox', action.postInboundAction)

	/* Documents */
	router.get('/store', file.listFiles)
	router.post('/store', file.createFile)
	router.post('/store/:preset/:fileName', file.postFile)
	router.get('/store/:fileId{/:label}', file.getFile)
	router.patch('/store/:fileId', file.patchFile)
	router.put('/store/:fileId/tag/:tag', file.putFileTag)
	router.delete('/store/:fileId/tag/:tag', file.deleteFileTag)
	router.get('/tag', file.listTags)
	//router.get('/store/:id', meta.getStore)

	/* Refs */
	router.get('/ref', ref.listRefs)
	router.get('/ref/:id', ref.getRef)
	router.post('/ref/:type', ref.postRef)

	/* Notification */
	router.post('/notification/subscription', notification.postNotificationSubscription)

	/* Own profile */
	router.get('/me', profile.getOwnProfile)
	router.get('/me/keys', profile.getOwnProfileKeys)
	router.get('/me/full', profile.getOwnProfileFull)
	router.patch('/me', profile.patchOwnProfile)
	router.put('/me/image', profile.putOwnProfileImage)
	router.put('/me/cover', profile.putOwnCoverImage)
	// users/communities
	router.get('/profile', profile.listProfiles)
	router.get('/profile/:idTag', profile.getProfile)
	router.patch('/profile/:idTag', profile.patchProfile)

	/* Settings */
	router.get('/settings', settings.listSettings)
	router.get('/settings/:name', settings.getSetting)
	router.put('/settings/:name', settings.putSetting)

	/* Database */
	router.get('/db/:fileId', database.listData)
	router.post('/db/:fileId', database.postData)
	router.get('/db/:fileId/:dataId', database.getData)
	//router.delete('/dn/:dbId/:dataId', deleteData)
}

// vim: ts=4
