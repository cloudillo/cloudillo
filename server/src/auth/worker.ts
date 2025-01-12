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

import { nanoid } from 'nanoid'

import { AuthAdapter } from '../auth-adapter.js'
import { metaAdapter } from '../adapters.js'
import { addTask } from '../worker.js'
import * as acme from './acme.js'

let authAdapter: AuthAdapter

///////////////
// ACME task //
///////////////
async function acmeTask() {
	await acme.processCertRenewals(authAdapter)
	return false
}

export async function initWorker(auth: AuthAdapter, opts: { baseIdTag: string, baseAppDomain?: string, basePassword?: string, acmeEmail?: string }) {
	authAdapter = auth

	// Check base tenant
	const idTag = await authAdapter.getIdentityTag(1)
	console.log('IDTAG', idTag)
	if (!idTag) {
		console.log('CREATE BASE TENANT', opts.baseIdTag, opts.basePassword)
		await authAdapter.createTenant(opts.baseIdTag, {
			password: opts.basePassword || nanoid()
		})
		const name = opts.baseIdTag.replace(/\..*$/, '')
		await metaAdapter.createTenant(1, opts.baseIdTag, { name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() })
	}

	if (opts.acmeEmail) {
		acme.init(authAdapter, opts.acmeEmail)
		const baseCert = await authAdapter.getCertByTag(opts.baseIdTag)
		console.log('BASE idTag / appDomain', opts.baseIdTag, opts.baseAppDomain)
		if (!baseCert || ((opts.baseAppDomain || opts.baseIdTag) != (baseCert.domain || baseCert.idTag))) {
			acme.createCert(1, authAdapter, opts.baseIdTag, opts.baseAppDomain)
		}
		addTask(acmeTask)
	}
}

// vim: ts=4
