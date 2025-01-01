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

import { AuthAdapter } from '../auth-adapter.js'
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

export async function initWorker(auth: AuthAdapter, opts: { baseUrl: string, acmeEmail?: string }) {
	authAdapter = auth

	if (opts.acmeEmail) {
		acme.init(authAdapter, opts.acmeEmail)
		const baseCert = await authAdapter.getCertByTag(opts.baseUrl)
		console.log('BASE URL', opts.baseUrl)
		if (!baseCert) {
			//acme.createCert(1, authAdapter, opts.baseUrl, opts.baseUrl)
		}
		addTask(acmeTask)
	}
}

// vim: ts=4
