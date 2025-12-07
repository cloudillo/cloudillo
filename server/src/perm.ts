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

import { Auth, Context } from './index.js'
import { metaAdapter } from './adapters.js'

export async function checkPerm(
	tnId: number,
	tenantTag: string,
	auth: Auth | undefined,
	perm: 'W' | 'R' | 'A',
	resId?: string
): Promise<string | false> {
	const [authResId, authResAccess] = auth?.subject?.split(':') || []
	console.log(`[${tenantTag}] CHECK PERM`, auth, resId, perm)
	if (!auth?.idTag) return 'no token'

	if (authResId && authResId != resId) return 'subject resource mismatch'

	if (auth?.idTag == tenantTag) return false

	if (resId) {
		// Check access for resource
		const shareAction = await metaAdapter.getActionByKey(tnId, `FSHR:${resId}:${auth.idTag}`)
		console.log('ACTION', tnId, `FSHR:${resId}`, shareAction)
		if (!shareAction?.subType) return 'no access'

		if (perm == 'A' && shareAction.subType == 'ADMIN') return false
		if (perm == 'W' && ['WRITE', 'ADMIN'].includes(shareAction.subType)) return false
		if (perm == 'R' && ['READ', 'WRITE', 'ADMIN'].includes(shareAction.subType)) return false

		return 'not allowed'
	} else {
		return 'not allowed'
	}
}

export function checkPermMW(perm: 'W' | 'R' | 'A', param?: string) {
	return async function checkPermMW(ctx: Context, next: () => Promise<void>) {
		const { tnId, tenantTag } = ctx.state

		const deny = await checkPerm(
			tnId,
			tenantTag,
			ctx.state.auth,
			perm,
			param != null ? ctx.params[param] : undefined
		)
		if (deny) {
			console.log('PERMISSION DENIED:', deny)
			ctx.throw(403)
		}

		await next()
	}
}

export function checkPermProfileMW(perm: 'R' | 'W' | 'A') {
	return async function checkPermProfileMW(ctx: Context, next: () => Promise<void>) {
		const { tnId, tenantTag } = ctx.state
		const idTag = ctx.state.auth?.idTag

		if (idTag == tenantTag) return next()

		const profile = idTag ? await metaAdapter.readProfile(tnId, idTag) : undefined
		console.log('CHECK PERM PROFILE', tnId, idTag, profile?.perm)

		if (!profile?.perm) ctx.throw(403)
		switch (perm) {
			case 'A':
				if (profile.perm != 'A') ctx.throw(403)
				break
			case 'W':
				if (!['W', 'A'].includes(profile.perm)) ctx.throw(403)
				break
			case 'R':
				if (!['R', 'W', 'A'].includes(profile.perm)) ctx.throw(403)
				break
		}

		await next()
	}
}

// vim: ts=4
