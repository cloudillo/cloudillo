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

import * as T from '@symbion/runtype'

export const tAccessToken = T.struct({
	t: T.string, // tenantTag
	u: T.optional(T.string), // User idTag
	r: T.optional(T.array(T.string)), // Roles
	sub: T.optional(T.string) // Subject ("resourceId:permission") for restricted access
})
export type AccessToken = T.TypeOf<typeof tAccessToken>

export const tActionToken = T.struct({
	iss: T.string,
	k: T.string,
	t: T.string,
	st: T.optional(T.string),
	//c: T.optional(T.string),
	c: T.optional(T.unknown),
	p: T.optional(T.string),
	a: T.optional(T.array(T.string)),
	aud: T.optional(T.string),
	sub: T.optional(T.string),
	iat: T.number,
	exp: T.optional(T.number)
})
export type ActionToken = T.TypeOf<typeof tActionToken>

export const tProxyToken = T.struct({
	t: T.literal('PROXY'),
	iss: T.string,
	k: T.string,
	iat: T.number,
	exp: T.number
})
export type ProxyToken = T.TypeOf<typeof tProxyToken>

export const tAuthProfile = T.struct({
	idTag: T.string,
	roles: T.optional(T.array(T.string)),
	keys: T.array(
		T.struct({
			keyId: T.string,
			publicKey: T.string,
			expires: T.optional(T.number)
		})
	)
})
export type AuthProfile = T.TypeOf<typeof tAuthProfile>

export const tAuthPasswordData = T.struct({
	id: T.number,
	idTag: T.string,
	passwordHash: T.string
})
export type AuthPasswordData = T.TypeOf<typeof tAuthPasswordData>

export const tAuthKeyData = T.struct({
	id: T.number,
	idTag: T.string,
	keyId: T.string,
	publicKey: T.string
	//privateKey: T.string
})
export type AuthKeyData = T.TypeOf<typeof tAuthKeyData>

export const tCreateTenantData = T.struct({
	vfyCode: T.optional(T.string),
	email: T.optional(T.string),
	password: T.optional(T.string)
})
export type CreateTenantData = T.TypeOf<typeof tCreateTenantData>

export const tWebauthnData = T.struct({
	credentialId: T.string,
	counter: T.number,
	publicKey: T.string,
	descr: T.string
})
export type WebauthnData = T.TypeOf<typeof tWebauthnData>

export interface AuthAdapter {
	getAuthProfile: (idTag: string) => Promise<Omit<AuthProfile, 'keys'> | undefined>
	getAuthProfileFull: (idTag: string) => Promise<AuthProfile | undefined>
	getIdentityTag: (tnId: number) => Promise<string>
	getTenantId: (idTag: string) => Promise<number | undefined>
	getAuthPassword: (idTag: string) => Promise<AuthPasswordData | undefined>
	getAuthPasswordById: (tenantId: number) => Promise<AuthPasswordData | undefined>
	setAuthPassword: (idTag: string, password: string) => Promise<void>
	getAuthKey: (idTag: string) => Promise<AuthKeyData | undefined>
	getAuthKeyById: (tnId: number) => Promise<AuthKeyData | undefined>
	getVapidKeys: (tnId: number) => Promise<{ vapidPublicKey: string; vapidPrivateKey: string }>
	getVapidPublicKey: (tnId: number) => Promise<string>
	storeVapidKeys: (tnId: number, vapidPublicKey: string, vapidPrivateKey: string) => Promise<void>
	setGlobal: (key: string, value: string) => Promise<void>
	getGlobal: (key: string) => Promise<string | undefined>
	createTenantRegistration: (email: string) => Promise<void>
	createTenant: (idTag: string, data: CreateTenantData) => Promise<number>
	deleteTenant: (tnId: number) => Promise<void>
	storeTenantCert: (
		tnId: number,
		idTag: string,
		domain: string,
		cert: string,
		key: string,
		expires: Date
	) => Promise<void>
	processCertRenewals: (
		callback: (tnId: number, idTag: string, domain: string, expires: Date) => Promise<boolean>
	) => Promise<number>
	getCertByTag: (
		idTag: string
	) => Promise<
		{ tnId: number; idTag: string; domain?: string; cert: string; key: string } | undefined
	>
	getCertByDomain: (
		domain: string
	) => Promise<
		{ tnId: number; idTag: string; domain?: string; cert: string; key: string } | undefined
	>
	listWebauthnCredentials: (tnId: number) => Promise<WebauthnData[]>
	getWebauthnCredential: (tnId: number, credentialId: string) => Promise<WebauthnData | undefined>
	createWebauthnCredential: (tnId: number, data: WebauthnData) => Promise<void>
	updateWebauthnCredentialCounter: (
		tnId: number,
		credentialId: string,
		counter: number
	) => Promise<void>
	deleteWebauthnCredential: (tnId: number, credentialId: string) => Promise<void>
	createKey: (tnId: number) => Promise<{ keyId: string; publicKey: string }>
	createToken: (
		tnId: number,
		data: Omit<ActionToken, 'iss' | 'k' | 'iat' | 'exp'>,
		opts?: { expiresIn?: string; expiresAt?: number }
	) => Promise<string | undefined>
	createAccessToken: (
		data: AccessToken,
		opts?: { expiresIn?: string; expiresAt?: number }
	) => Promise<string>
	verifyAccessToken: (tenantTag: string, token: string) => Promise<AccessToken | undefined>
}

// vim: ts=4
