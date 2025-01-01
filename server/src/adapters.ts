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

import { MetaAdapter } from './meta-adapter.js'
import { BlobAdapter } from './blob-adapter.js'
import { CrdtAdapter } from './crdt-adapter.js'
import { DatabaseAdapter } from './database-adapter.js'
import { MessageBusAdapter } from './message-bus-adapter.js'

export let metaAdapter: MetaAdapter
export let blobAdapter: BlobAdapter
export let crdtAdapter: CrdtAdapter
export let databaseAdapter: DatabaseAdapter
export let messageBusAdapter: MessageBusAdapter

export async function init(adapters: {
	metaAdapter: MetaAdapter
	blobAdapter: BlobAdapter
	crdtAdapter: CrdtAdapter
	databaseAdapter: DatabaseAdapter
	messageBusAdapter: MessageBusAdapter
}) {
	metaAdapter = adapters.metaAdapter
	blobAdapter = adapters.blobAdapter
	crdtAdapter = adapters.crdtAdapter
	databaseAdapter = adapters.databaseAdapter
	messageBusAdapter = adapters.messageBusAdapter
}

// vim: ts=4
