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

import crypto from 'crypto'

import * as t from '@symbion/runtype'
import { Context } from './index.js'

// Delay asynchronously
export async function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(() => resolve(), ms))
}

// Cancelable delay
export interface Delay {
	promise: Promise<'timeout' | 'cancelled'>
	cancel?: () => void
}

export function cancelableDelay(ms: number): Delay {
	let timeout: NodeJS.Timeout
	let resolveDelay: (value: 'timeout' | 'cancelled') => void
	const promise = new Promise<'timeout' | 'cancelled'>((resolve) => {
		timeout = setTimeout(() => resolve('timeout'), ms)
		resolveDelay = resolve
	})
	const ret: Delay = {
		promise,
		cancel: function cancel() {
			clearTimeout(timeout)
			resolveDelay('cancelled')
			ret.cancel = undefined
		}
	}
	return ret
}

export function validate<T>(ctx: Context, reqType: t.Type<T>, value: Object = ctx.request.body instanceof Object ? ctx.request.body : {}): T {
	const result = reqType.decode(value, { coerceDate: true })
	if (t.isOk(result)) {
		return result.ok
	} else {
		ctx.body = {
			error: 'E-PARSE',
			errStr: result.err
		}
		console.log('REQ', JSON.stringify(value, null, 4))
		console.log('ERROR', JSON.stringify(ctx.body, null, 4))
		ctx.throw(406, JSON.stringify(ctx.body))
	}
}

export function validateQS<T>(ctx: Context, reqType: t.Type<T>, value: Object = ctx.request.query): T {
	const result = reqType.decode(value, { coerceAll: true, coerceToArray: str => (typeof str === 'string') ? str.split(',') : [str] })
	if (t.isOk(result)) {
		return result.ok
	} else {
		ctx.body = {
			error: 'E-PARSE',
			errStr: result.err
		}
		console.log('QS', JSON.stringify(ctx.body, null, 4))
		ctx.throw(406, JSON.stringify(ctx.body))
	}
}

export class ServerError extends Error {
	code: string
	descr: string
	httpStatus: number

	constructor(code: string, descr: string, httpStatus: number = 400) {
		super(descr)
		this.code = code
		this.descr = descr
		this.httpStatus = httpStatus
	}
}

export function sha256(s: string | Buffer) {
	//return crypto.createHash('sha256').update(s).digest('hex')
	return crypto.createHash('sha256').update(s).digest('base64url')
}

// vim: ts=4
