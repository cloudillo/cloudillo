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

import acme from 'acme-client'

import { AuthAdapter } from '../auth-adapter.js'
import { X509Certificate } from 'crypto'

let acmeClient: acme.Client
const acmeChallengeResponses: Record<string, string> = {}

export async function createCert(
	tnId: number,
	authAdapter: AuthAdapter,
	idTag: string,
	domain?: string
) {
	console.log('createCert', idTag, domain)
	if (!acmeClient) {
		throw new Error('ACME client not initialized')
	}

	const [key, csr] = await acme.crypto.createCsr({
		altNames: [domain ? domain : idTag, 'cl-o.' + idTag]
	})

	const cert = await acmeClient.auto({
		termsOfServiceAgreed: process.env.ACME_TERMS_AGREED == 'true',
		challengePriority: ['http-01'],
		skipChallengeVerification: true,
		csr,
		challengeCreateFn: async (authz, challenge, keyAuthorization) => {
			console.log('CHALLENGE received:', challenge.token)
			acmeChallengeResponses[challenge.token] = keyAuthorization
		},
		challengeRemoveFn: async (authz, challenge) => {
			delete acmeChallengeResponses[challenge.token]
			console.log('CHALLENGE removed', challenge.token)
		}
	})
	const x509cert = new X509Certificate(cert)
	const expires = new Date(new X509Certificate(cert).validTo)
	await authAdapter.storeTenantCert(tnId, idTag, domain || idTag, cert, key.toString(), expires)
	console.log('STORED CERT', tnId, idTag, x509cert)
}

export async function getChallengeResponse(token: string) {
	return acmeChallengeResponses[token]
}

export async function processCertRenewals(authAdapter: AuthAdapter) {
	return authAdapter.processCertRenewals(async function processCertRenewal(
		tnId: number,
		idTag: string,
		domain: string
	) {
		console.log('processCertRenewal', tnId, idTag)

		const [key, csr] = await acme.crypto.createCsr({
			altNames: [idTag, 'cl-o.' + idTag]
		})

		const cert = await acmeClient.auto({
			termsOfServiceAgreed: process.env.ACME_TERMS_AGREED == 'true',
			challengePriority: ['http-01'],
			skipChallengeVerification: true,
			csr,
			challengeCreateFn: async (authz, challenge, keyAuthorization) => {
				console.log('CHALLENGE received:', challenge.token, keyAuthorization)
				acmeChallengeResponses[challenge.token] = keyAuthorization
			},
			challengeRemoveFn: async (authz, challenge) => {
				delete acmeChallengeResponses[challenge.token]
				console.log('CHALLENGE removed', challenge.token)
			}
		})
		const x509cert = new X509Certificate(cert)
		const expires = new Date(new X509Certificate(cert).validTo)
		console.log('CERT', x509cert)
		authAdapter.storeTenantCert(tnId, idTag, domain, cert, key.toString(), expires)
		return true
	})
}

export async function init(authAdapter: AuthAdapter, acmeEmail?: string) {
	if (acmeEmail) {
		console.log('ACME: initializing...')
		let acmeKey: string | undefined = await authAdapter.getGlobal('acme.key')
		if (!acmeKey) {
			console.log('Generating ACME_KEY...')
			acmeKey = (await acme.crypto.createPrivateKey()).toString()
			console.log('Initializin ACME client...')
			acmeClient = new acme.Client({
				directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
				//directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
				accountKey: acmeKey
			})
			console.log('Creating ACME account...')
			const account = await acmeClient.createAccount({
				contact: ['mailto:' + acmeEmail],
				termsOfServiceAgreed: true
			})
			//console.log('ACME account', account)
			console.log('Storing ACME key...')
			authAdapter.setGlobal('acme.key', acmeKey)
		} else {
			console.log('Initializing ACME client...')
			acmeClient = new acme.Client({
				directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
				accountKey: acmeKey
			})
		}
	}
}

// vim: ts=4
