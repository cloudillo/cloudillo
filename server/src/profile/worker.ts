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

import jwt from 'jsonwebtoken'

import * as T from '@symbion/runtype'

import { addSlowTask } from '../worker.js'
import { metaAdapter } from '../adapters.js'
import { syncProfile } from './profile.js'

// Profile refresh //
/////////////////////
export async function processProfileRefresh() {
	return metaAdapter.processProfileRefresh(async function processProfileRefresh(tnId, idTag, eTag) {
		await syncProfile(tnId, idTag, eTag)
		return true
	})
}

export async function profileWorker(): Promise<boolean> {
	let ret = await processProfileRefresh()
	return !!ret
}

export async function initWorker() {
	addSlowTask(profileWorker)
}

// vim: ts=4
