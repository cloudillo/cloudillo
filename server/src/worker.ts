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

import { delay, cancelableDelay, Delay } from './utils.js'
import { AuthAdapter } from './auth-adapter.js'
import { MetaAdapter } from './meta-adapter.js'
import { BlobAdapter } from './blob-adapter.js'
import { CrdtAdapter } from './crdt-adapter.js'
import { DatabaseAdapter } from './database-adapter.js'
import { MessageBusAdapter } from './message-bus-adapter.js'
import { initWorker as initAuthWorker } from './auth/worker.js'
import { init as initAdapters } from './adapters.js'
import { initWorker as initFileWorker } from './file/worker.js'
import { initWorker as initActionWorker } from './action/worker.js'
import { initWorker as initProfileWorker } from './profile/worker.js'
import { initWorker as initMessageBusWorker } from './message-bus/worker.js'

/////////////////////
// Signal handlers //
/////////////////////
process.on('SIGINT', () => {
	console.log('received signal: SIGINT')
	process.exit()
})

process.on('SIGTERM', () => {
	console.log('received signal: SIGTERM')
	process.exit()
})

/////////////////
// Task runner //
/////////////////
export type Task = () => Promise<boolean>
const tasks: Task[] = []
const slowTasks: Task[] = []

let delayRef: Delay | undefined

async function taskRunner() {
	//console.trace('taskRunner')
	while (true) {
		try {
			//console.log('Running tasks...')
			let busy = false
			for (const task of tasks) {
				busy = busy || await task()
			}
			//if (!busy) await delay(10_000)
			//console.log('taskRunner busy:', busy)
			if (!busy) {
				delayRef = cancelableDelay(10_000)
				const res = await delayRef.promise
				//console.log('Delay:', res)
				delayRef = undefined
			}
		} catch (err) {
			console.log('ERROR', err instanceof Error ? err.toString() : err)
			//await delay(10_000)
			delayRef = cancelableDelay(10_000)
			const res = await delayRef.promise
			//console.log('Delay:', res)
			delayRef = undefined
		}
	}
}

export function cancelWait() {
	delayRef?.cancel?.()
}

export function addTask(task: Task) {
	tasks.push(task)
}

async function slowTaskRunner() {
	//console.trace('slowTaskRunner')
	while (true) {
		try {
			//console.log('Running slow tasks...')
			let busy = false
			for (const task of slowTasks) {
				busy = busy || await task()
			}
			if (!busy) await delay(10_000)
		} catch (err) {
			console.log('ERROR', err instanceof Error ? err.toString() : err)
			await delay(10_000)
		}
	}
}

export function addSlowTask(task: Task) {
	slowTasks.push(task)
}

export interface WorkerConfig {
	baseUrl: string
	acmeEmail?: string
}

export interface CloudilloWorkerOptions {
	config: WorkerConfig
	authAdapter: AuthAdapter
	metaAdapter: MetaAdapter
	blobAdapter: BlobAdapter
	crdtAdapter: CrdtAdapter
	databaseAdapter: DatabaseAdapter
	messageBusAdapter: MessageBusAdapter
}

export async function run({ config, authAdapter, metaAdapter, blobAdapter, crdtAdapter, databaseAdapter, messageBusAdapter }: CloudilloWorkerOptions) {
	await initAuthWorker(authAdapter, { baseUrl: config.baseUrl, acmeEmail: config.acmeEmail })
	//await initMetaStore(metaAdapter)
	await initAdapters({ metaAdapter, blobAdapter, crdtAdapter, databaseAdapter, messageBusAdapter })
	await initFileWorker()
	await initActionWorker()
	await initProfileWorker()
	await initMessageBusWorker()
	console.log('====[ Cloudillo worker service ready ]=================================================')

	//runWorker(metaAdapter)
	taskRunner()
	slowTaskRunner()
}

// vim: ts=4
