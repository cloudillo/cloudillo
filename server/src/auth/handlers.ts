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

const TOKEN_EXPIRE = 365 * 24 // hours

import crypto from 'crypto'
import KoaRouter from 'koa-router'
import { Context as BaseContext } from 'koa'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import sqlite from 'sqlite3'
import { AsyncDatabase } from 'promised-sqlite3'
import { LRUCache } from 'lru-cache'
import bns from 'bns'
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	//GenerateRegistrationOptionsOpts,
} from '@simplewebauthn/server'
import WebPush from 'web-push'
const { generateVAPIDKeys } = WebPush

import * as browser from 'detect-browser'

import * as T from '@symbion/runtype'
import { Action } from '@cloudillo/types'

import { AuthAdapter, AccessToken } from '../auth-adapter.js'
import { metaAdapter } from '../adapters.js'
import { validate, validateQS, ServerError } from '../utils.js'
import { App, State, Context, Router } from '../index.js'
import { checkToken } from '../action/action.js'

import * as acme from './acme.js'

let authAdapter: AuthAdapter

export function passwordHash(password: string, salt?: string) {
	const s = salt ? Buffer.from(salt, 'base64url') : crypto.randomBytes(16)
	const hash = crypto.scryptSync(password, s, 64).toString('base64url')
	return `${s.toString('base64url')}:${hash}`
}

export const tProxyToken = T.struct({
	t: T.literal('PROXY'),
	iss: T.string,
	k: T.string,
	iat: T.number,
	exp: T.number
})
export type ProxyToken = T.TypeOf<typeof tProxyToken>

//////////
// Keys //
//////////
export async function getVapidKeys(tnId: number) {
	const vapid = await authAdapter.getVapidKeys(tnId)
	if (!vapid?.vapidPublicKey) {
		const { publicKey, privateKey } = generateVAPIDKeys()
		await authAdapter.storeVapidKeys(tnId, publicKey, privateKey)
		return {
			vapidPublicKey: publicKey,
			vapidPrivateKey: privateKey
		}
	}
	return vapid
}

export async function getVapidPublicKey(ctx: Context) {
	const { vapidPublicKey } = await getVapidKeys(ctx.state.tnId)
	ctx.body = { vapidPublicKey }
}

export function determineTenantTag(hostName: string) {
	return hostName.startsWith('cl-o.') ? hostName.slice(5) : hostName
}

export async function determineTnId(hostName: string) {
	const tenantTag = determineTenantTag(hostName)
	const tnId = await authAdapter.getTenantId(tenantTag)
	//if (!tnId) throw new Error('Unknown tenant')

	return tnId
}

export async function getIdentityTag(tnId: number) {
	return authAdapter.getIdentityTag(tnId)
}

export async function getAuthProfile(tenantTag: string) {
	return authAdapter.getAuthProfile(tenantTag)
}

export async function getAuthProfileFull(tenantTag: string) {
	return authAdapter.getAuthProfileFull(tenantTag)
}

///////////
// Login //
///////////
enum UserRole {
	owner = 'O',
	guest = 'G'
}

interface LoginResult {
	tnId: number
	idTag: string
	name: string
	profilePic?: string
	roles: string[]
	settings: Record<string, unknown>
	token: string
}

async function returnLogin(ctx: Context, login: Omit<LoginResult, 'token' | 'settings'>, remember: boolean = false) {
	if (login.tnId) {
		//if (!login.roles.includes() && login.userId === login.tnId) login.roles.push(0)

		console.log('LOGIN', login)
		const token = await authAdapter.createAccessToken({
			t: login.idTag,
			r: login.roles
		}, { expiresIn: TOKEN_EXPIRE + 'h' })
		/*
		ctx.cookies.set('token', token, { httpOnly: true, secure: true, maxAge: remember ? TOKEN_EXPIRE * 1000 * 3600 : undefined })
		ctx.cookies.set('login', '1', { httpOnly: false, secure: true, maxAge: remember ? TOKEN_EXPIRE * 1000 * 3600 : undefined })
		*/

		const authProfile = await authAdapter.getAuthProfile(login.idTag)
		const profile = await metaAdapter.readTenant(login.tnId)
		const settings = await metaAdapter.listSettings(ctx.state.tnId, { prefix: ['ui'] })
		login.name = profile?.name || '-'
		login.profilePic = profile?.profilePic?.ic
		ctx.body = {
			...login,
			roles: authProfile?.roles,
			settings,
			token
		}
	} else {
		ctx.throw(403)
	}
}

const tLogin = T.struct({
	idTag: T.string,
	password: T.string,
	remember: T.optional(T.boolean)
})

export async function postLogin(ctx: Context) {
	const tnId = ctx.state.tnId
	console.log('LOGIN', ctx.request.body)
	const p = validate(ctx, tLogin)

	try {
		const auth = await authAdapter.getAuthPassword(p.idTag)
		console.log('AUTH', p.idTag, auth)

		if (!auth) ctx.throw(403)
		console.log(p.password, passwordHash(p.password, auth.passwordHash.split(':')[0]))
		if (passwordHash(p.password, auth.passwordHash.split(':')[0]) !== auth.passwordHash) ctx.throw(403)


		await returnLogin(ctx, {
			tnId,
			idTag: auth.idTag,
			name: '-',
			//roles: roles ? JSON.parse(roles) : [],
			roles: []
		}, p.remember)
	} catch (err) {
		console.log('LOGIN ERROR', err)
		ctx.throw(403)
	}
}

// Logout
export async function postLogout(ctx: Context) {
	console.log('Logout', ctx.state.user)
	ctx.cookies.set('token')
	ctx.cookies.set('login')
	ctx.body = {}
}

//////////////
// Register //
//////////////
async function verifyRegisterData(type: 'local' | 'domain', idTag: string, appDomain: string | undefined, localIps: string[]) {
	// DNS
	const resolver = new bns.RecursiveResolver({
		minimize: true,
	})
	resolver.hints.setDefault()
	//resolver.on('log', (args: any) => console.log('RESOLVER', args))

	const tenantData = await authAdapter.getAuthProfile(idTag)
	const domainData = await authAdapter.getCertByDomain(appDomain || idTag)

	if (type == 'local') {
		return {
			ip: localIps,
			idTagError: tenantData ? 'used'
				: false,
			appError: domainData ? 'used'
				: false
		}
		
	} else {
		const apiRes = await resolver.lookup('cl-o.' + idTag, 'A')
		//console.log(apiRes)
		const apiIp = apiRes.answer.pop()?.data?.address
		console.log(apiIp)

		const appRes = await resolver.lookup(appDomain || idTag, 'A')
		//console.log(appRes)
		const appIp = appRes.answer.pop()?.data?.address
		console.log(appIp)

		return {
			ip: localIps,
			idTagError: tenantData ? 'used'
				: !apiIp ? 'nodns'
				: !localIps.includes(apiIp) ? 'ip'
				: false,
			appError: domainData ? 'used'
				: !appIp ? 'nodns'
				: !localIps.includes(appIp) ? 'ip'
				: false,
			apiIp,
			appIp,
		}
	}
}

const tRegisterVerify = T.struct({
	type: T.literal('ref', 'local', 'domain'),
	idTag: T.string.matches(/^([a-zA-Z0-9-]+)(\.[a-zA-Z0-9-]+)*$/),
	appDomain: T.optional(T.string),
	registerToken: T.string
})
export async function postRegisterVerify(ctx: Context) {
	const tnId = ctx.state.tnId
	console.log('REGISTER VERIFY', ctx.request.body)
	const p = validate(ctx, tRegisterVerify)

	const ref = await metaAdapter.getRef(tnId, p.registerToken)
	console.log('ref', ref)
	if (p.registerToken !== ref?.refId || ref?.type != 'register') ctx.throw(403)
	if (p.type == 'ref') {
		ctx.body = {}
		return
	}

	ctx.body = await verifyRegisterData(p.type, p.idTag, p.appDomain, ctx.config.localIps || [])
}

const tRegister = T.struct({
	type: T.literal('local', 'domain'),
	idTag: T.string.matches(/^([a-zA-Z0-9-]+)(\.[a-zA-Z0-9-]+)*$/),
	appDomain: T.optional(T.string),
	password: T.string,
	email: T.string,
	registerToken: T.string
})
export async function postRegister(ctx: Context) {
	const tnId = ctx.state.tnId
	console.log('REGISTER', ctx.request.body)
	const p = validate(ctx, tRegister)

	const ref = await metaAdapter.getRef(tnId, p.registerToken)
	console.log('ref', ref)
	if (p.registerToken !== ref?.refId || ref?.type != 'register') ctx.throw(403)

	const vfy = await verifyRegisterData(p.type, p.idTag, p.appDomain, ctx.config.localIps || [])
	console.log('VERIFY', vfy)
	if (vfy.idTagError || vfy.appError) ctx.throw(422)

	const newTnId = await authAdapter.createTenant(p.idTag, {
		password: p.password,
		email: p.email,
	})
	const name = p.idTag.replace(/\..*$/, '')
	await metaAdapter.createTenant(newTnId, p.idTag, {
		name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
		type: 'person'
	})
	await metaAdapter.updateSetting(newTnId, 'ui.onboarding', 'join')
	await metaAdapter.useRef(tnId, p.registerToken)

	// ACME
	if (ctx.config.acmeEmail) await acme.createCert(newTnId, authAdapter, p.idTag, p.appDomain)

	ctx.body = {
	}
}

export async function getAcmeChallengeResponse(ctx: BaseContext) {
	const { token } = ctx.params
	console.log('CHALLENGE REQUEST', token)

	if (token == 'test') {
		ctx.body = 'test'
		return
	}

	const response = await acme.getChallengeResponse(token)

	console.log('CHALLENGE RESPONSE', token, response)

	if (!response) ctx.throw(404)

	ctx.body = response
}

// Login Token
export async function getLoginToken(ctx: Context) {
	const tnId = ctx.state.tnId
	const idTag = ctx.state.user?.t

	console.log('LOGIN TOKEN', ctx.state.user)
	if (!idTag) {
		ctx.body = {}
		return
	}

	try {
		const auth = await authAdapter.getAuthPassword(ctx.state.tenantTag)
		if (!auth) ctx.throw(403)

		//var roles = (await db.all<{ roleId: number }>('SELECT roleId FROM user_roles WHERE tnId=$tnId AND userId=$userId',
		//	{ $tnId: tnId, $userId: userId })).map(r => r.roleId)
		//if (owner) roles.push(-1)
		//console.log('ROLES', roles)

		await returnLogin(ctx, {
			tnId,
			idTag: auth.idTag,
			name: 'FIXME',
			roles: []
			}, true /* FIXME */)
	} catch (err) {
		console.log('TOKEN ERROR', err)
		//ctx.status = 403
		ctx.throw(403)
	}
}

// Access token
const tGetAccessToken = T.struct({
	subject: T.optional(T.string),
	token: T.optional(T.string)
})

export async function getAccessToken(ctx: Context) {
	const { tnId, tenantTag } = ctx.state
	const q = validateQS(ctx, tGetAccessToken)
	let token

	const subject =
		!q.subject ? undefined
		: typeof q.subject == 'string' ? q.subject.split(':')
		: q.subject
	if (subject && subject.length != 3) ctx.throw(422, 'Invalid subject')

	const [resIdTag, resId, resAccess] = subject || []
	const sub = subject ? `${resId}:${resAccess}` : undefined

	if (!q.token) {
		// Use current authenticated user
		if (!ctx.state.user) ctx.throw(403)

		if (resIdTag == tenantTag) {
			// Local resource access
			console.log(`[${tenantTag}] GET LOCAL ACCESS TOKEN`, q.subject, ctx.state.auth)

			token = await authAdapter.createAccessToken({
				t: tenantTag,
				u: ctx.state.user?.u || ctx.state.user?.t,
				r: ctx.state.user?.r,
				sub
			})
		} else {
			// Remote resource access
			console.log(`[${tenantTag}] GET REMOTE ACCESS TOKEN`, q.subject, ctx.state.auth)
			token = await createProxyToken(tnId, resIdTag, {
				subject: subject ? `${resIdTag}:${resId}:${resAccess}` : undefined
			})
		}
	} else {
		// Grant access for guest user using specified token
		const guest = await checkToken(tnId, q.token)
		console.log(`[${tenantTag}] GET GUEST ACCESS TOKEN`, { iss: guest.iss, subject: q.subject })
		if (guest.aud != tenantTag) ctx.throw(403)
		const idTag = guest.iss
		try {
			token = await authAdapter.createAccessToken({
				t: tenantTag,
				u: idTag,
				r: ctx.state.user?.r,
				sub
			})
		} catch (err) {
			console.log('TOKEN ERROR', err)
			ctx.throw(403)
		}
	}
	ctx.body = { token }
}

// Proxy token
const proxyTokenCache: Record<number, LRUCache<string, string>> = {}

export async function createProxyToken(tnId: number, targetTag: string, opts: { subject?: string } = {}) {
	let cache = !opts.subject ? undefined : proxyTokenCache[tnId]
	if (!cache && !opts.subject) proxyTokenCache[tnId] = cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 * 1 /* 1h */ })
	let token = cache?.get(targetTag)
	if (token) return token

	try {
		console.log('PROXY TOKEN cache miss', tnId, targetTag)
		const profile = await metaAdapter.readProfile(tnId, targetTag)
		if (!profile?.status) return

		const authToken = await authAdapter.createToken(tnId, {
			t: 'PROXY',
			aud: targetTag
		},
		{
			expiresIn: '1m'
		})

		// Get access token to target
		//console.log('authToken', authToken)
		const tokenRes = await fetch('https://cl-o.' + targetTag + `/api/auth/access-token?token=${authToken}${opts.subject ? `&subject=${opts.subject}` : ''}`)
		if (tokenRes.ok) {
			//console.log('tokenRes', tokenRes.status)
			const token = (await tokenRes.json()).token
			//console.log('PROXY TOKEN miss', targetTag, token)
			cache?.set(targetTag, token)

			return token
		} else {
			console.log('tokenRes', tokenRes.status)
			console.log('tokenRes', await tokenRes.text())
		}
	} catch (err) {
		console.log('TOKEN ERROR', err)
		return
	}
}

export async function getProxyToken(ctx: Context) {
	const targetTag = ctx.query.idTag
	console.log('GET PROXY TOKEN', ctx.state.user, targetTag)
	if (!ctx.state.tenantTag || typeof targetTag != 'string') ctx.throw(403)

	const token = await createProxyToken(ctx.state.tnId, targetTag)
	ctx.body = { token }
}

// Action token
export async function createActionToken(tnId: number, userId: number, action: Action) {
	try {
		const token = await authAdapter.createToken(tnId, {
			t: action.type + (action.subType ? ':' + action.subType : ''),
			aud: action.audienceTag,
			sub: action.subject,
			p: action.parentId,
			c: action.content,
			a: action.attachments
		}, {
			expiresAt: action.expiresAt ? Math.trunc(action.expiresAt) : undefined
		})
		return token
	} catch (err) {
		console.log('TOKEN ERROR', err)
		return
	}
}

/////////////////////
// Password change //
/////////////////////
const tSetPassword = T.struct({
	oldPassword: T.optional(T.string),
	code: T.optional(T.string),
	password: T.string
})

export async function postSetPassword(ctx: Context) {
	const p = validate(ctx, tSetPassword)
	console.log('SET PASSWD', p)

	try {
		if (p.code) {
			await ctx.db.proc('SELECT api.user__reset_password($1, $2);',
				[p.code, p.password])
			ctx.body = {}
		} else if (p.oldPassword !== undefined) {
			if (!ctx.state.user?.t) ctx.throw(403)
			await ctx.db.proc('SELECT api.user__set_password($1, $2, $3);',
				[ctx.state.user?.t, p.oldPassword, p.password])
			ctx.body = {}
		} else ctx.throw(403)
	} catch (err) {
		console.log('SET PASSWORD ERROR', err)
		//ctx.status = 403
		ctx.throw(403)
	}
}

const tResetPasswordRequest = T.struct({
	email: T.string,				// Primary user email
	secEmail: T.optional(T.string)	// Email to send the request to
})

export async function postResetPasswordRequest(ctx: Context) {
	const p = validate(ctx, tResetPasswordRequest)

	try {
		const vfyCode = nanoid()
		await ctx.db.proc('SELECT api.user__reset_password_request($1, $2, $3);',
			[p.email, p.secEmail || p.email, vfyCode])
		// await sendMail('PWDC', {
		// 	to: p.email,
		// 	site: config.siteName,
		// 	link: `${ctx.config.baseURL}/register/passwd?code=${vfyCode}` // FIXME
		// })
		ctx.body = {}
	} catch (err) {
		console.log('RESET PASSWORD REQUEST ERROR', err)
		ctx.throw(403)
	}
}

//////////////
// WebAuthn //
//////////////
const webauthnJwtSecret = crypto.randomBytes(32).toString('hex')

export async function getWebauthnRegisterRequest(ctx: Context) {
	const { tnId, tenantTag } = ctx.state
	console.log('getWebauthnRegisterRequest', tenantTag, tnId)
	if (!tnId) return ctx.throw(403)

	//const opts: GenerateRegistrationOptionsOpts = {
	const options = await generateRegistrationOptions({
		rpName: 'Cloudillo',
		rpID: tenantTag,
		userName: tenantTag,
		//attestationType: 'none',
		attestationType: 'direct',
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'discouraged'
		}
	})

	console.log('challengeResponse', options)
	ctx.body = {
		options,
		//challenge: options.challenge,
		token: jwt.sign({ tnId, challenge: options.challenge }, webauthnJwtSecret, { expiresIn: '2m' })
	}
}

// Webauthn register
const tWebauthnRegister = T.struct({
	response: T.any,
	token: T.string
})

export async function postWebauthnRegister(ctx: Context) {
	const { tnId, tenantTag } = ctx.state
	console.log('BODY', ctx.request.body)

	try {
		const { response, token } = validate(ctx, tWebauthnRegister)
		const { tnId, challenge } = jwt.verify(token, webauthnJwtSecret) as any
		const ua = browser.detect(ctx.request.headers['user-agent'])
		const uaStr = `${ua?.os || '-'}/${ua?.name || '-'} ${ua?.version || '-'}`
		console.log('UA', ua)

		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: `https://${tenantTag}`,
			expectedRPID: tenantTag,
			requireUserVerification: false
		})
		if (!verification.verified || !verification.registrationInfo) ctx.throw(403)
		const { publicKey, id: credentialId, counter } = verification.registrationInfo.credential
		console.log('CREDENTIAL', publicKey, credentialId, counter)

		await authAdapter.createWebauthnCredential(tnId, {
			credentialId,
			counter,
			publicKey: Buffer.from(publicKey).toString('base64'),
			descr: uaStr
		})

		ctx.body = {}
	} catch (err) {
		console.log('WEBAUTHN REGISTER ERROR', err)
		if (err instanceof ServerError) throw err
		ctx.throw(403)
	}
}

export async function deleteWebauthnDeleteCredential(ctx: Context) {
	const keyId = ctx.params.keyId
	console.log('DELETE credential', keyId, ctx.state.user?.t)
	if (!ctx.state.user?.t) ctx.throw(403)
	console.log('DELETE credential', keyId)

	try {
		await authAdapter.deleteWebauthnCredential(ctx.state.tnId, keyId)
		ctx.body = {}
	} catch (err) {
		console.log('DELETE CREDENTIAL ERROR', err)
		if (err instanceof ServerError) throw err
		ctx.throw(403)
	}
}

export async function getWebauthnLoginRequest(ctx: Context) {
	const allowCredentials = (await authAdapter.listWebauthnCredentials(ctx.state.tnId)).map(c => ({ id: c.credentialId }))
	const options = await generateAuthenticationOptions({
		rpID: ctx.state.tenantTag,
		allowCredentials,
		userVerification: 'discouraged'
	})

	console.log('WEBAUTHN LOGIN REQUEST', options)
	ctx.body = {
		options,
		token: jwt.sign({ tnId: ctx.state.tnId, challenge: options.challenge }, webauthnJwtSecret, { expiresIn: '2m' })
	}
}

const tWebauthnLogin = T.struct({
	response: T.any,
	/*
	result: T.struct({
		rawId: T.string,
		response: T.any
	}),
	*/
	token: T.string
})

export async function postWebauthnLogin(ctx: Context) {
	const tenantTag = ctx.state.tenantTag
	const tnId = ctx.state.tnId
	console.log('BODY', ctx.request.body)

	try {
		const { response, token } = validate(ctx, tWebauthnLogin)
		const { tnId: tokenTnId, challenge } = jwt.verify(token, webauthnJwtSecret) as any
		const credential = await authAdapter.getWebauthnCredential(tnId, response.id)
		console.log('CREDENTIAL', tnId, tokenTnId, credential)

		if (!credential) ctx.throw(403)
		const verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: `https://${tenantTag}`,
			expectedRPID: tenantTag,
			requireUserVerification: false,
			credential: {
				//credentialID: credential.credentialId,
				id: response.id,
				counter: credential.counter,
				publicKey: Buffer.from(credential.publicKey, 'base64'),
			}
		})
		if (!verification.verified || !verification.authenticationInfo) ctx.throw(403)

		if (verification.authenticationInfo.newCounter != credential.counter) {
			await authAdapter.updateWebauthnCredentialCounter(tnId, response.credentialId, verification.authenticationInfo.newCounter)
		}

		await returnLogin(ctx, {
			tnId,
			idTag: tenantTag,
			name: 'FIXME',
			//roles: roles ? JSON.parse(roles) : [],
			roles: [],
		})
	} catch (err) {
		console.log('WEBAUTHN REGISTER ERROR', err)
		if (err instanceof ServerError) throw err
		ctx.throw(403)
	}
}

// Module init
export async function init(auth: AuthAdapter, opts: { acmeEmail?: string } = {}) {
	authAdapter = auth

	//acme.init(authAdapter, opts.acmeEmail)
}

// vim: ts=4
