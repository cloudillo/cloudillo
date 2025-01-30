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

import fs from 'fs/promises'
import path from 'path'
import dayjs from 'dayjs'
import sqlite from 'sqlite3'
import { AsyncDatabase } from 'promised-sqlite3'
import crypto from 'crypto'
import { LRUCache } from 'lru-cache'
import jwt from 'jsonwebtoken'

import * as T from '@symbion/runtype'
import { AuthAdapter, AuthProfile, AuthPasswordData, AuthKeyData, CreateTenantData, WebauthnData, ActionToken, AccessToken } from '@cloudillo/server/types/auth-adapter'

import { randomString } from './utils.js'

let db: AsyncDatabase
let privateDir: string
let certDir: string | undefined
let keyDir: string | undefined
let jwtSecret: string | undefined

interface InitOpts {
	privateDir: string
	certDir?: string
	keyDir?: string
	sqliteBusyTimeout?: number
}

export async function init(opts: InitOpts): Promise<AuthAdapter> {
	[privateDir, certDir, keyDir] = [opts.privateDir, opts.certDir, opts.keyDir]
	sqlite.verbose()
	await fs.mkdir(opts.privateDir, { recursive: true })
	if (certDir) await fs.mkdir(certDir, { recursive: true })
	if (keyDir) await fs.mkdir(keyDir, { recursive: true })
	db = await AsyncDatabase.open(path.join(opts.privateDir, 'auth.db'))
	db.inner.configure('busyTimeout', opts.sqliteBusyTimeout ?? 300)

	// Init DB
	await db.run(`CREATE TABLE IF NOT EXISTS globals (
		key text NOT NULL,
		value text,
		PRIMARY KEY(key)
	)`)

	await db.run(`CREATE TABLE IF NOT EXISTS tenants (
		tnId integer NOT NULL,
		idTag text,
		email text,
		password text,
		status char(1),
		roles json,
		vapidPublicKey text,
		vapidPrivateKey text,
		createdAt datetime DEFAULT current_timestamp,
		PRIMARY KEY(tnId)
	)`)

	await db.run(`CREATE TABLE IF NOT EXISTS keys (
		tnId integer NOT NULL,
		keyId text NOT NULL,
		status char(1),
		expiresAt datetime,
		publicKey text,
		privateKey text,
		PRIMARY KEY(tnId, keyId)
	)`)

	await db.run(`CREATE TABLE IF NOT EXISTS certs (
		tnId integer NOT NULL,
		status char(1),
		idTag text,
		domain text,
		expiresAt datetime,
		cert text,
		key text,
		PRIMARY KEY(tnId)
	)`)
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_certs_idTag ON certs (idTag)')
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_certs_domain ON certs (domain)')

	await db.run(`CREATE TABLE IF NOT EXISTS user_vfy (
		vfyCode text NOT NULL,
		email text NOT NULL,
		func text NOT NULL,
		createdAt datetime DEFAULT current_timestamp,
		PRIMARY KEY(vfyCode)
	)`)
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vfy_email ON user_vfy (email)')

	await db.run(`CREATE TABLE IF NOT EXISTS webauthn (
		tnId integer NOT NULL,
		credentialId text NOT NULL,
		counter integer NOT NULL,
		publicKey text NOT NULL,
		createdAt datetime DEFAULT current_timestamp,
		descr text NOT NULL,
		PRIMARY KEY(tnId, credentialId)
	)`)
		

	await db.run(`CREATE TABLE IF NOT EXISTS events (
		evId integer NOT NULL,
		tnId integer NOT NULL,
		type text NOT NULL,
		ip text,
		data text,
		PRIMARY KEY(evId)
	)`)

	return {
		getAuthProfile,
		getAuthProfileFull,
		getIdentityTag,
		getTenantId,
		getAuthPassword,
		getAuthPasswordById,
		createKey,
		getAuthKey,
		getAuthKeyById,
		createToken,
		createAccessToken,
		verifyAccessToken,
		getVapidKeys,
		getVapidPublicKey,
		storeVapidKeys,
		setGlobal,
		getGlobal,
		createTenantRegistration,
		createTenant,
		storeTenantCert,
		processCertRenewals,
		getCertByTag,
		getCertByDomain,
		listWebauthnCredentials,
		getWebauthnCredential,
		createWebauthnCredential,
		updateWebauthnCredentialCounter,
		deleteWebauthnCredential,
	}
}

///////////////////////
// Utility functions //
///////////////////////
export function hashPassword(password: string, salt?: string) {
	const s = salt ? Buffer.from(salt, 'base64url') : crypto.randomBytes(16)
	const hash = crypto.scryptSync(password, s, 64).toString('base64url')
	return `${s.toString('base64url')}:${hash}`
}

/////////////
// Globals //
/////////////
async function setGlobal(key: string, value: string) {
	await db.run('INSERT OR REPLACE INTO globals (key, value) VALUES ($key, $value)', { $key: key, $value: value })
}

async function getGlobal(key: string) {
	const { value } = await db.get<{ value: string }>('SELECT min(value) as value FROM globals WHERE key = $key', { $key: key })
	return value
}

///////////////////////
// User registration //
///////////////////////
async function createTenantRegistration(email: string) {
	const registered = await db.get<{ email: string }>("SELECT tnId FROM tenants WHERE email = $email AND status = 'A'", { $email: email })
	if (registered.email) throw new Error(`${email} already registered`)

	const vfyCode = randomString(20)
	await db.run('INSERT OR REPLACE INTO user_vfy (email, vfyCode, func) VALUES ($email, $vfyCode, "register")', { $email: email, $vfyCode: vfyCode })
}

///////////
// Users //
///////////
async function createTenant(idTag: string, data: CreateTenantData): Promise<number> {
	if (data.vfyCode) {
		const vfyCodeEmail = await db.get<{ email: string }>('SELECT email FROM user_vfy WHERE vfyCode = $vfyCode', { $vfyCode: data.vfyCode })
		if (vfyCodeEmail.email !== data.email) throw new Error('Invalid vfy code')
	}
	//const cryptedPassword = data.password ? await bcrypt.hash(data.password, 10) : null
	const cryptedPassword = data.password ? hashPassword(data.password) : null

	const res = await db.get<{ tnId: number }>(`INSERT INTO tenants (idTag, email, password, status)
		VALUES ($idTag, $email, $cryptedPassword, 'A')
		RETURNING tnId
	`, {
		$idTag: idTag,
		$email: data.email,
		$cryptedPassword: cryptedPassword
	})
	await createKey(res.tnId)
	if (data.vfyCode) {
		await db.run('DELETE FROM user_vfy WHERE vfyCode = $vfyCode', { $vfyCode: data.vfyCode })
	}
	return res.tnId
}

async function storeTenantCert(tnId: number, idTag: string, domain: string, cert: string, key: string, expiresAt: Date) {
	await db.run('INSERT OR REPLACE INTO certs (tnId, idTag, domain, expiresAt, cert, key) VALUES ($tnId, $idTag, $domain, $expiresAt, $cert, $key)',
		{ $tnId: tnId, $idTag: idTag, $domain: domain, $expiresAt: expiresAt.toISOString(), $cert: cert, $key: key })
	if (certDir) await fs.writeFile(path.join(certDir, idTag + '.pem'), cert)
	if (keyDir) await fs.writeFile(path.join(keyDir, idTag + '.pem'), key)
}

export async function processCertRenewals(callback: (tnId: number, idTag: string, domain: string, expiresAt: Date) => Promise<boolean>) {
	let processed = 0

	const renewals = await db.all<{ tnId: number, idTag: string, domain: string, expiresAt: string }>(
		`SELECT c.tnId, c.idTag, c.domain, c.expiresAt FROM certs c
			JOIN tenants t ON t.tnId = c.tnId
			WHERE c.status ISNULL AND date(c.expiresAt,'-30 days') < date('now')
			ORDER BY date(c.expiresAt) LIMIT 100`)
	for (const renewal of renewals) {
		console.log('RENEW cert:', renewal)
		try {
			const val = await callback(renewal.tnId, renewal.idTag, renewal.domain, new Date(renewal.expiresAt))
			/*
			if (val) {
				await db.run('UPDATE action_inbox SET status="A" WHERE actionId = $actionId', {
					$actionId: action.actionId
				})
				processed++
			}
			*/
		} catch (err) {
			console.log('ERROR', err)
			//await db.run("UPDATE action_inbox SET status='D' WHERE actionId = $actionId AND status ISNULL",
			//	{ $actionId: action.actionId })
		}
	}
	return processed
}

async function getCertByTag(idTag: string) {
	const certData = await db.get<{
		tnId: number,
		idTag: string,
		domain?: string,
		cert: string,
		key: string,
		expiresAt: string
	} | undefined>('SELECT tnId, idTag, domain, cert, key, expiresAt FROM certs WHERE idTag = $idTag', { $idTag: idTag })
	return !certData ? undefined : {
		...certData,
		expiresAt: new Date(certData.expiresAt)
	}
}

async function getCertByDomain(domain: string) {
	const certData = await db.get<{
		tnId: number,
		idTag: string,
		domain?: string,
		cert: string,
		key: string,
		expiresAt: string
	} | undefined>('SELECT tnId, idTag, domain, cert, key, expiresAt FROM certs WHERE domain = $domain', { $domain: domain })
	return !certData ? undefined : {
		...certData,
		expiresAt: new Date(certData.expiresAt)
	}
}

//////////////
// Webauthn //
//////////////
async function listWebauthnCredentials(tnId: number): Promise<WebauthnData[]> {
	const credentials = await db.all<{
		credentialId: string
		counter: number
		publicKey: string
		descr: string
	}>('SELECT credentialId, counter, publicKey, descr FROM webauthn WHERE tnId = $tnId', { $tnId: tnId}) ?? {}
	return credentials
}

async function getWebauthnCredential(tnId: number, credentialId: string): Promise<WebauthnData | undefined> {
	const { counter, publicKey, descr } = await db.get<{
		counter: number
		publicKey: string
		descr: string
	}>('SELECT counter, publicKey, descr FROM webauthn WHERE tnId = $tnId AND credentialId = $credentialId', { $tnId: tnId, $credentialId: credentialId }) ?? {}
	return {
		credentialId,
		counter,
		publicKey,
		descr
	}
}

async function createWebauthnCredential(tnId: number, data: WebauthnData): Promise<void> {
	await db.run('INSERT INTO webauthn (tnId, credentialId, counter, publicKey, descr) VALUES ($tnId, $credentialId, $counter, $publicKey, $descr)', {
		$tnId: tnId,
		$credentialId: data.credentialId,
		$counter: data.counter,
		$publicKey: data.publicKey,
		$descr: data.descr
	})
}

async function updateWebauthnCredentialCounter(tnId: number, credentialId: string, counter: number): Promise<void> {
	await db.run('UPDATE webauthn SET counter = $counter WHERE tnId = $tnId AND credentialId = $credentialId', {
		$tnId: tnId,
		$credentialId: credentialId,
		$counter: counter
	})
}

async function deleteWebauthnCredential(tnId: number, credentialId: string): Promise<void> {
	await db.run('DELETE FROM webauthn WHERE tnId = $tnId AND credentialId = $credentialId', {
		$tnId: tnId,
		$credentialId: credentialId
	})
}

//////////
// Keys //
//////////
async function generateKeyPair() {
	return new Promise<{ keyId: string, publicKey: string, privateKey: string }>(function (resolve, reject) {
		console.log('Generating EC-384 keys')
		const kp = crypto.generateKeyPair('ec', {
			namedCurve: 'secp384r1',
			publicKeyEncoding: { type: 'spki', format: 'pem' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
		},
		async function (err, publicKeyPEM: string, privateKeyPEM: string) {
			if (err) reject(err)
			const publicKey = publicKeyPEM.split(/\r\n|\n|\r/).filter(s => !s.startsWith('--')).join('')
			const privateKey = privateKeyPEM.split(/\r\n|\n|\r/).filter(s => !s.startsWith('--')).join('')
			const keyId = dayjs().format('YYYYMMDD')
			resolve({ keyId, publicKey, privateKey })
		})
	})
}

async function createKey(tnId: number) {
	const { keyId, publicKey, privateKey } = await generateKeyPair()

	await db.run('INSERT INTO keys (tnId, keyId, publicKey, privateKey) VALUES ($tnId, $keyId, $publicKey, $privateKey)', {
		$tnId: tnId,
		$keyId: keyId,
		$publicKey: publicKey,
		$privateKey: privateKey
	})

	return { keyId, publicKey }
}

async function getAuthProfile(idTag: string): Promise<Omit<AuthProfile, 'keys'> | undefined> {
	const profile = await db.get<Omit<AuthProfile & { roles: string }, 'keys'>>('SELECT tnId as id, idTag, roles FROM tenants WHERE idTag = $idTag', { $idTag: idTag })
	if (!profile) return

	return {
		...profile,
		roles: profile?.roles?.split(',')
	}
}

async function getAuthProfileFull(idTag: string): Promise<AuthProfile | undefined> {
	const profile = await db.get<Omit<AuthProfile & { id: number, roles?: string }, 'keys'>>('SELECT tnId as id, idTag, roles FROM tenants WHERE idTag = $idTag', { $idTag: idTag })
	if (!profile) return

	const keys = profile ? await db.all<{ keyId: string, expiresAt: number, publicKey: string }>('SELECT keyId, expiresAt, publicKey FROM keys WHERE tnId = $tnId', { $tnId: profile.id }) : []
	return {
		...{ ...profile, id: undefined },
		roles: profile?.roles?.split(','),
		keys: keys.map(k => ({ ...k, expiresAt: k.expiresAt || undefined }))
	}
}

async function getIdentityTag(tnId: number) {
	const { idTag } = await db.get<{ idTag: string }>('SELECT idTag FROM tenants WHERE tnId = $tnId', { $tnId: tnId }) || {}
	return idTag
}

async function getTenantId(idTag: string) {
	const { tnId } = await db.get<{ tnId: number }>('SELECT tnId FROM tenants WHERE idTag = $idTag', { $idTag: idTag }) || {}
	return tnId
}

async function getAuthPassword(idTag: string): Promise<AuthPasswordData | undefined> {
	const { id, passwordHash } =
		await db.get<{ id: number, passwordHash: string }>('SELECT tnId as id, password as passwordHash FROM tenants WHERE idTag = $idTag', { $idTag: idTag }) ?? {}
	console.log('getAuthPassword', id, idTag, passwordHash)
	if (!idTag) return
	else return {
		id,
		idTag,
		passwordHash
	}
}

async function getAuthPasswordById(tnId: number): Promise<AuthPasswordData | undefined> {
	const { id, idTag, passwordHash } =
		await db.get<{ id: number, idTag: string, passwordHash: string }>('SELECT tnId as id, idTag, password as passwordHash FROM tenants WHERE tnId = $tnId', { $tnId: tnId }) ?? {}
	if (!idTag) return
	else return {
		id,
		idTag,
		passwordHash
	}
}

async function getAuthKey(idTag: string): Promise<AuthKeyData | undefined> {
	const { id, keyId, publicKey, privateKey } = await db.get<{
		id: number
		keyId: string
		publicKey: string
		privateKey: string
	}>(
		"SELECT t.tnId as id, k.keyId, k.privateKey FROM tenants t "
		+ "JOIN keys k ON k.tnId = t.tnId "
		+ "WHERE t.idTag = $idTag "
		+ "ORDER BY k.keyId DESC LIMIT 1",
		{ $idTag: idTag }
	)

	if (!idTag || !privateKey) return
	return {
		id,
		idTag,
		keyId,
		publicKey
	}
}

async function getAuthKeyById(tnId: number): Promise<AuthKeyData | undefined> {
	const { id, idTag, keyId, publicKey, privateKey } = await db.get<{
		id: number
		idTag: string
		keyId: string
		publicKey: string
		privateKey: string
	}>(
		"SELECT t.tnId as id, t.idTag, k.keyId, k.privateKey FROM tenants t "
		+ "JOIN keys k ON k.tnId = t.tnId "
		+ "WHERE t.tnId = $tnId "
		+ "ORDER BY k.keyId DESC LIMIT 1",
		{ $tnId: tnId }
	)

	if (!idTag || !privateKey) return
	return {
		id,
		idTag,
		keyId,
		publicKey
	}
}

async function createToken(tnId: number, data: Omit<ActionToken, 'iss' | 'k' | 'iat' | 'exp'>, opts: { expiresIn?: string, expiresAt?: number } = {}): Promise<string | undefined> {
	const { idTag, keyId, publicKey, privateKey } = await db.get<{
		idTag: string
		keyId: string
		publicKey: string
		privateKey: string
	}>(
		"SELECT t.idTag, k.keyId, k.privateKey FROM tenants t "
		+ "JOIN keys k ON k.tnId = t.tnId "
		+ "WHERE t.tnId = $tnId "
		+ "ORDER BY k.keyId DESC LIMIT 1",
		{ $tnId: tnId }
	)

	if (!keyId) return
	const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`

	// Generate temporal auth token
	console.log('expiresIn', opts.expiresIn, 'expiresAt', opts.expiresAt, data)
	const token = jwt.sign(
		opts.expiresAt ? {
			exp: opts.expiresAt,
			...data,
			iss: idTag,
			iat: Math.floor(Date.now() / 10) / 100,
			k: keyId
		} : {
			...data,
			iss: idTag,
			iat: Math.floor(Date.now() / 10) / 100,
			k: keyId
		},
		privateKeyPEM,
		{
			algorithm: 'ES384',
			...(opts.expiresIn ? { expiresIn: opts.expiresIn as any } : {}),
		}
	)
	return token
}

async function assureJwtSecret(): Promise<string> {
	if (!jwtSecret) {
		jwtSecret = await getGlobal('jwtSecret')
		if (!jwtSecret) {
			jwtSecret = randomString(32)
			await setGlobal('jwtSecret', jwtSecret)
		}
	}
	return jwtSecret
}

async function createAccessToken(data: AccessToken, opts: { expiresIn?: string, expiresAt?: number } = {}): Promise<string> {
	const token = jwt.sign(
		opts.expiresAt ? { ...data, exp: opts.expiresAt } : data,
		await assureJwtSecret(),
		{
			algorithm: 'HS256',
			...(opts.expiresIn ? { expiresIn: opts.expiresIn as any } : {})
		}
	)
	return token
}

async function verifyAccessToken(tenantTag: string, token: string): Promise<AccessToken | undefined> {
	const login: AccessToken = jwt.verify(token, await assureJwtSecret()) as unknown as AccessToken
	if (login.t != tenantTag) return
	return login
}

// Web push
async function getVapidKeys(tnId: number) {
	const ret = await db.get<{ vapidPublicKey: string, vapidPrivateKey: string }>('SELECT vapidPublicKey, vapidPrivateKey FROM tenants WHERE tnid = $tnId', { $tnId: tnId })
	return ret
}

async function getVapidPublicKey(tnId: number) {
	const { vapidPublicKey } = await db.get<{ vapidPublicKey: string }>('SELECT vapidPublicKey FROM tenants WHERE tnid = $tnId', { $tnId: tnId })
	return vapidPublicKey
}

async function storeVapidKeys(tnId: number, vapidPublicKey: string, vapidPrivateKey: string) {
	await db.run('UPDATE tenants SET vapidPublicKey = $vapidPublicKey, vapidPrivateKey = $vapidPrivateKey WHERE tnid = $tnId', {
		$vapidPublicKey: vapidPublicKey,
		$vapidPrivateKey: vapidPrivateKey,
		$tnId: tnId
	})
}

// vim: ts=4
