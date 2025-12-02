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

if (!process.env.BASE_ID_TAG || !process.env.BASE_PASSWORD)
	throw new Error('ENV:BASE_ID_TAG and ENV:BASE_PASSWORD must be specified!')

export const config = {
	baseIdTag: process.env.BASE_ID_TAG,
	baseAppDomain: process.env.BASE_APP_DOMAIN,
	basePassword: process.env.BASE_PASSWORD,
	acmeEmail: process.env.ACME_EMAIL,
	privateDir: process.env.PRIVATE_DATA_DIR || './data/priv',
	publicDir: process.env.PUBLIC_DATA_DIR || './data/pub',
	localIps: process.env.LOCAL_IPS ? process.env.LOCAL_IPS.split(',') : undefined,
	localDomains: process.env.LOCAL_DOMAINS ? process.env.LOCAL_DOMAINS.split(',') : undefined
}

import * as path from 'path'
//import * as Worker from '@cloudillo/server/build/worker.js'
import * as Worker from '@cloudillo/server/worker'
import * as AuthAdapter from '@cloudillo/auth-adapter-sqlite'
import * as MetaAdapter from '@cloudillo/meta-adapter-sqlite'
import * as BlobAdapter from '@cloudillo/blob-adapter-fs'
import * as CrdtAdapter from '@cloudillo/crdt-adapter-leveldb'
import * as DatabaseAdapter from '@cloudillo/database-adapter-acebase'
import * as MessageBusAdapter from '@cloudillo/message-bus-adapter-inprocess'

const authAdapter = await AuthAdapter.init({ privateDir: config.privateDir })
const metaAdapter = await MetaAdapter.init({ dir: config.privateDir })
const blobAdapter = await BlobAdapter.init({
	privateDir: path.join(config.privateDir, 'blob'),
	publicDir: path.join(config.publicDir, 'blob')
})
const crdtAdapter = await CrdtAdapter.init({ dir: config.privateDir })
const databaseAdapter = await DatabaseAdapter.init({ dir: config.privateDir })
const messageBusAdapter = await MessageBusAdapter.init()

Worker.run({
	config,
	authAdapter,
	metaAdapter,
	blobAdapter,
	crdtAdapter,
	databaseAdapter,
	messageBusAdapter
})

// vim: ts=4
