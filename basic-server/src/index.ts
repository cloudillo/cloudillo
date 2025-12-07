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
const envMode = process.env.MODE ?? ''

export const config: CloudilloServer.Config = {
	jwtSecret: process.env.JWT_SECRET || 'secret',
	mode: ['standalone', 'proxy', 'stream_proxy'].includes(envMode)
		? (envMode as CloudilloServer.Config['mode'])
		: 'standalone',
	listen: +(process.env.LISTEN || (process.env.MODE != 'proxy' ? 443 : 1443)),
	listenHttp: +(process.env.LISTEN_HTTP || 0) || (process.env.MODE != 'proxy' ? 80 : undefined),
	baseIdTag: process.env.BASE_ID_TAG,
	baseAppDomain: process.env.BASE_APP_DOMAIN,
	basePassword: process.env.BASE_PASSWORD,
	distDir: process.env.DIST_DIR || './dist',
	acmeEmail: process.env.ACME_EMAIL || undefined,
	localIps: process.env.LOCAL_IPS ? process.env.LOCAL_IPS.split(',') : undefined,
	identityProviders: process.env.IDENTITY_PROVIDERS
		? process.env.IDENTITY_PROVIDERS.split(',')
		: undefined
}
const baseDir = process.env.DATA_DIR || './data'
const privateDir = process.env.PRIVATE_DATA_DIR || path.join(baseDir, 'priv')
const publicDir = process.env.PUBLIC_DATA_DIR || path.join(baseDir, 'pub')

if (!config.jwtSecret) throw new Error('JWT_SECRET not specified!')

import * as path from 'path'
import * as CloudilloServer from '@cloudillo/server'
//import * as Worker from '@cloudillo/server/build/worker.js'
import * as Worker from '@cloudillo/server/worker'
import * as AuthAdapter from '@cloudillo/auth-adapter-sqlite'
import * as MetaAdapter from '@cloudillo/meta-adapter-sqlite'
import * as BlobAdapter from '@cloudillo/blob-adapter-fs'
import * as CrdtAdapter from '@cloudillo/crdt-adapter-leveldb'
import * as DatabaseAdapter from '@cloudillo/database-adapter-acebase'
import * as MessageBusAdapter from '@cloudillo/message-bus-adapter-inprocess'

const authAdapter = await AuthAdapter.init({
	privateDir: path.join(privateDir, 'auth'),
	certDir: path.join(privateDir, 'auth', 'certs'),
	keyDir: path.join(privateDir, 'auth', 'keys')
})
const metaAdapter = await MetaAdapter.init({ dir: path.join(privateDir, 'meta') })
const blobAdapter = await BlobAdapter.init({
	privateDir: path.join(privateDir, 'blob'),
	publicDir: path.join(publicDir, 'blob')
})
const crdtAdapter = await CrdtAdapter.init({ dir: path.join(privateDir, 'crdt') })
const databaseAdapter = await DatabaseAdapter.init({ dir: path.join(privateDir, 'db') })
const messageBusAdapter = await MessageBusAdapter.init()

if (!config.jwtSecret) throw new Error('JWT_SECRET not specified!')

CloudilloServer.run({
	config,
	authAdapter,
	metaAdapter,
	blobAdapter,
	crdtAdapter,
	databaseAdapter,
	messageBusAdapter
})
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
