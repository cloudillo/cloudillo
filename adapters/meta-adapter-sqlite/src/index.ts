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

import { MetaAdapter } from '@cloudillo/server/types/meta-adapter'

import { init as initDB } from './db.js'
import * as action from './action.js'
import * as tenant from './tenant.js'
import * as profile from './profile.js'
import * as files from './files.js'
import * as ref from './ref.js'
import * as settings from './settings.js'
import * as subscriptions from './subscriptions.js'
import * as tag from './tag.js'

export async function init({ dir }: { dir: string }): Promise<MetaAdapter> {
	await initDB({ dir })

	return {
		...action,
		...tenant,
		...profile,
		...files,
		...ref,
		...settings,
		...subscriptions,
		...tag
	}
}

// vim: ts=4
