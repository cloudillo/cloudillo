// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Client for the Cloudillo Android app's JS bridge (protocol v1).
 *
 * The app injects `window.CloudilloNative` via `WebViewCompat.addWebMessageListener`,
 * restricted to the shell's own origin. Requests are `{v:1, id, method, params}`;
 * native answers `{id, result}` / `{id, error}` or pushes `{event, data}`.
 *
 * Also runs the device-key handoff (mint a `device:<folderId>` API key for the
 * "Phone backup" folder and hand it to native) and answers native `download` events.
 * The device key is a secret: never logged, never kept here after the handoff.
 *
 * When a protocol v2 adds methods, gate them on `NativeInfo.bridgeVersion`.
 */

import { getApiClient } from '@cloudillo/core'
import { type AuthState, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useApiContext } from './context/hooks.js'
import { isValidIdTag } from '../sw/id-tag.js'

interface NativeObject {
	postMessage(message: string): void
	onmessage: ((evt: MessageEvent) => void) | null
}

declare global {
	interface Window {
		CloudilloNative?: NativeObject
	}
}

export interface NativeInfo {
	bridgeVersion: number
	appVersion: string
	deviceName: string
	idTag: string
	hasDeviceKey: boolean
	/** Id of the device key native holds; absent when it has none or on older apps. */
	deviceKeyId?: string
}

/**
 * `download` event; `idTag`/`hat` are set by native for https downloads, absent for blob:/data:.
 * `error` set: native cannot download this URL, nothing to answer (the shell only toasts).
 */
interface DownloadEvent {
	reqId: number
	url: string
	mimeType?: string
	fileName?: string
	idTag?: string
	hat?: string
	error?: string
}

const REQUEST_TIMEOUT_MS = 30_000
const CHUNK_BYTES = 512 * 1024
const BACKUP_FOLDER_NAME = 'Phone backup'

interface Pending {
	resolve: (result: unknown) => void
	reject: (err: Error) => void
	timer: ReturnType<typeof setTimeout>
}

let nextId = 1
const pending = new Map<number, Pending>()
const eventListeners = new Map<string, Set<(data: unknown) => void>>()
let infoPromise: Promise<NativeInfo> | undefined

export function isNativeApp(): boolean {
	return typeof window.CloudilloNative !== 'undefined'
}

function native(): NativeObject {
	const obj = window.CloudilloNative
	if (!obj) throw new Error('Not running in the Cloudillo app')
	// Re-attach when native re-injects the object (e.g. after a WebView reload of the listener)
	if (obj.onmessage !== onNativeMessage) obj.onmessage = onNativeMessage
	return obj
}

// No origin/source check: `CloudilloNative` is injected via `addWebMessageListener`
// restricted to the shell origin (enforced in the Android app, `MainActivity`).
function onNativeMessage(evt: MessageEvent) {
	let msg: { id?: unknown; result?: unknown; error?: unknown; event?: unknown; data?: unknown }
	try {
		msg = JSON.parse(String(evt.data))
	} catch {
		return
	}
	if (typeof msg.id === 'number') {
		const p = pending.get(msg.id)
		if (!p) return
		pending.delete(msg.id)
		clearTimeout(p.timer)
		if (msg.error != null) p.reject(new Error(String(msg.error)))
		else p.resolve(msg.result)
	} else if (typeof msg.event === 'string') {
		for (const cb of eventListeners.get(msg.event) ?? []) cb(msg.data)
	}
}

/** The request got no answer in time; native may still have acted on it. */
export class NativeTimeoutError extends Error {}

export function nativeRequest<T>(
	method: string,
	params?: object,
	timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
	const obj = native()
	const id = nextId++
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(id)
			reject(new NativeTimeoutError(`Native request timed out: ${method}`))
		}, timeoutMs)
		pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer })
		obj.postMessage(JSON.stringify({ v: 1, id, method, params: params ?? {} }))
	})
}

export function onNativeEvent<T = unknown>(name: string, cb: (data: T) => void): () => void {
	native()
	let set = eventListeners.get(name)
	if (!set) {
		set = new Set()
		eventListeners.set(name, set)
	}
	const listener = cb as (data: unknown) => void
	set.add(listener)
	return () => {
		set.delete(listener)
	}
}

/**
 * The `hello` answer, requested once and cached (a failed attempt is retried on the next call).
 * Rejects on a host whose bridge protocol this shell does not speak.
 */
export function getNativeInfo(): Promise<NativeInfo> {
	if (!infoPromise) {
		infoPromise = nativeRequest<NativeInfo>('hello')
			.then((info) => {
				if (typeof info.bridgeVersion !== 'number' || info.bridgeVersion < 1) {
					throw new Error('This version of the Cloudillo app is not supported')
				}
				return info
			})
			.catch((err) => {
				infoPromise = undefined
				throw err
			})
	}
	return infoPromise
}

function refreshNativeInfo(): Promise<NativeInfo> {
	infoPromise = undefined
	return getNativeInfo()
}

// Backup //
////////////

export const BACKUP_PRESETS = ['default', 'high_quality', 'mobile', 'archive', 'orig-only'] as const
export type BackupPreset = (typeof BACKUP_PRESETS)[number]

export interface BackupGlobals {
	defaultPreset: BackupPreset
	defaultMobileData: boolean
	requiresCharging: boolean
	videosWifiOnly: boolean
}

export interface BackupPermissions {
	media: 'granted' | 'limited' | 'denied'
	notifications: boolean
}

/** `preset` / `mobileData` null = inherit the global default. */
export interface BackupSource {
	id: string
	kind: 'media' | 'saf'
	name: string
	enabled: boolean
	preset: BackupPreset | null
	mobileData: boolean | null
	cutoffMs: number | null
	newestFirst: boolean
	counts: { total: number; done: number; pending: number; failed: number }
}

export interface BackupProgress {
	done: number
	total: number
}

export interface BackupState {
	permissions: BackupPermissions
	relinkNeeded: boolean
	globals: BackupGlobals
	sources: BackupSource[]
	running: boolean
	progress: BackupProgress | null
}

export interface BackupFailure {
	name: string
	lastError: string | null
	attempts: number
}

/** Calls that wait on a system UI (picker, permission prompt) the user may linger in. */
const INTERACTIVE_TIMEOUT_MS = 10 * 60_000

export const backupApi = {
	getState: () => nativeRequest<BackupState>('backup.getState'),
	setGlobals: (globals: Partial<BackupGlobals>) =>
		nativeRequest<BackupState>('backup.setGlobals', globals),
	setSource: (params: {
		id: string
		preset?: BackupPreset | null
		mobileData?: boolean | null
		newestFirst?: boolean
	}) => nativeRequest<BackupState>('backup.setSource', params),
	estimate: (id: string) =>
		nativeRequest<{ count: number; bytes: number }>('backup.estimate', { id }),
	enableSource: (id: string, includeExisting: boolean) =>
		nativeRequest<BackupState>('backup.enableSource', { id, includeExisting }),
	disableSource: (id: string) => nativeRequest<BackupState>('backup.disableSource', { id }),
	addFolder: () =>
		nativeRequest<BackupSource | null>('backup.addFolder', undefined, INTERACTIVE_TIMEOUT_MS),
	removeFolder: (id: string) => nativeRequest<BackupState>('backup.removeFolder', { id }),
	requestPermissions: () =>
		nativeRequest<BackupPermissions>(
			'backup.requestPermissions',
			undefined,
			INTERACTIVE_TIMEOUT_MS
		),
	runNow: () => nativeRequest<BackupState>('backup.runNow'),
	failures: (id: string) => nativeRequest<BackupFailure[]>('backup.failures', { id })
}

/** Native notifications on this device (the WebView has no Web Push). */
export interface PushState {
	enabled: boolean
	permission: boolean
	hasDeviceKey: boolean
	/** Installed UnifiedPush distributors; 0 means only the 30-minute poll. */
	distributors: number
	distributor: string | null
	subscribed: boolean
}

export const pushApi = {
	getState: () => nativeRequest<PushState>('push.getState'),
	enable: () => nativeRequest<PushState>('push.enable', undefined, INTERACTIVE_TIMEOUT_MS),
	disable: () => nativeRequest<PushState>('push.disable')
}

/**
 * Backup state from native: fetched on mount, re-fetched on `backup.changed`, progress
 * patched in from `backup.progress`. `setState` takes the full state the mutations return.
 */
export function useBackupState() {
	const [state, setState] = React.useState<BackupState>()
	const [error, setError] = React.useState<Error>()
	// Only the latest fetch or mutation result lands
	const seq = React.useRef(0)

	const refresh = React.useCallback(function refresh() {
		const mine = ++seq.current
		getNativeInfo()
			.then(() => backupApi.getState())
			.then(
				(s) => {
					if (mine !== seq.current) return
					setState(s)
					setError(undefined)
				},
				(err: Error) => {
					if (mine === seq.current) setError(err)
				}
			)
	}, [])

	const apply = React.useCallback(function apply(s: BackupState) {
		seq.current++
		setState(s)
	}, [])

	React.useEffect(
		function backupSubscribe() {
			if (!isNativeApp()) return
			refresh()
			const offChanged = onNativeEvent('backup.changed', refresh)
			const offProgress = onNativeEvent<BackupProgress>('backup.progress', (p) => {
				setState(
					(s) => s && { ...s, running: true, progress: { done: p.done, total: p.total } }
				)
				// Final state from native, even if it sends no `backup.changed`
				if (p.total > 0 && p.done >= p.total) refresh()
			})
			return () => {
				offChanged()
				offProgress()
			}
		},
		[refresh]
	)

	return { state, setState: apply, error, refresh }
}

// Device-key handoff //
////////////////////////

type HomeApi = ReturnType<typeof getApiClient>

async function findOrCreateBackupFolder(api: HomeApi): Promise<string> {
	const folders = await api.files.list({
		parentId: '__root__',
		channel: '',
		type: 'FLDR',
		q: BACKUP_FOLDER_NAME
	})
	// `q` is a substring match
	const found = folders.find((f) => f.fileName === BACKUP_FOLDER_NAME)
	if (found) return found.id
	const created = await api.files.create({
		fileTp: 'FLDR',
		contentType: 'cloudillo/folder',
		fileName: BACKUP_FOLDER_NAME,
		parentId: undefined
	})
	return created.id
}

let handoffChain: Promise<void> = Promise.resolve()
/** Keys whose `setDeviceKey` timed out: native may or may not hold them. */
const unconfirmedKeys = new Set<string>()

function warnDeleteFailed(what: string, id: unknown, e: unknown) {
	console.warn(`[native] ${what} cleanup failed:`, id, e instanceof Error ? e.message : e)
}

/** A relink was asked for, but the app is bound to a different account than the signed-in one. */
export class DeviceAccountMismatchError extends Error {}

/** Mints and hands over a device key; `force` replaces one native already has (relink). */
async function runHandoff(idTag: string, force: boolean): Promise<void> {
	// Fresh every time: native may have cleared its key since the last hello
	const info = await refreshNativeInfo()
	// The app is bound to one tenant; only its owner, signed in as themselves, mints the key.
	if (info.idTag !== idTag) {
		if (force) throw new DeviceAccountMismatchError()
		return
	}
	const api = getApiClient(idTag)
	// Revoke timed-out keys native did not end up holding. Older apps report no
	// `deviceKeyId`: there only a device without any key proves they are orphaned.
	for (const id of unconfirmedKeys) {
		const held = info.deviceKeyId !== undefined ? info.deviceKeyId === id : info.hasDeviceKey
		if (!held)
			await api.auth
				.deleteApiKey(id)
				.catch((e) => warnDeleteFailed('orphaned device key', id, e))
	}
	unconfirmedKeys.clear()
	if (!force && info.hasDeviceKey) return
	const folderId = await findOrCreateBackupFolder(api)
	const key = await api.auth.createApiKey({
		name: `Android: ${info.deviceName}`,
		scopes: `device:${folderId}`
	})
	try {
		await nativeRequest('setDeviceKey', { key: key.plaintextKey, keyId: key.id })
	} catch (err) {
		if (err instanceof NativeTimeoutError) {
			// Native may have stored it: the next handoff's hello decides
			unconfirmedKeys.add(String(key.id))
		} else {
			// Native never stored it: don't leave an orphaned live key behind
			await api.auth
				.deleteApiKey(key.id)
				.catch((e) => warnDeleteFailed('orphaned device key', key.id, e))
		}
		throw err
	}
	// Relink: revoke the key this device held before (older apps don't say which)
	const old = info.deviceKeyId
	if (old !== undefined && old !== String(key.id)) {
		await api.auth.deleteApiKey(old).catch((e) => warnDeleteFailed('old device key', old, e))
	}
}

/** Queued behind any running handoff; a repeat is cheap once `hasDeviceKey` is set. */
function queueHandoff(idTag: string, force: boolean): Promise<void> {
	const run = handoffChain.then(() => runHandoff(idTag, force))
	handoffChain = run.catch((err) => {
		console.warn(
			'[native] device key handoff failed:',
			err instanceof Error ? err.message : err
		)
	})
	return run
}

export function ensureDeviceKey(idTag: string): Promise<void> {
	return queueHandoff(idTag, false).catch(() => {})
}

/** Replaces a device key the server rejected; rejects on failure. */
export function relinkDevice(idTag: string): Promise<void> {
	return queueHandoff(idTag, true)
}

// Downloads //
///////////////

function toBase64(bytes: Uint8Array): string {
	let s = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	}
	return btoa(s)
}

/** True once native has finalized the file (the last chunk's reply). */
async function sendBlob(reqId: number, url: string): Promise<boolean> {
	try {
		const blob = await (await fetch(url)).blob()
		let offset = 0
		do {
			const end = Math.min(offset + CHUNK_BYTES, blob.size)
			const bytes = new Uint8Array(await blob.slice(offset, end).arrayBuffer())
			// Awaiting each chunk is the backpressure
			await nativeRequest('downloadChunk', {
				reqId,
				b64: toBase64(bytes),
				last: end >= blob.size
			})
			offset = end
		} while (offset < blob.size)
		return true
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err)
		// Native drops the entry; if native itself failed it already did, and this errors harmlessly
		await nativeRequest('downloadChunk', { reqId, b64: '', last: true, error }).catch(() => {})
		return false
	}
}

/** Whether `url` is a file download URL on `idTag`'s tenant (what `shell/sw/download.ts` serves). */
export function isTenantUrl(url: string, idTag: string): boolean {
	if (!isValidIdTag(idTag)) return false
	try {
		const u = new URL(url)
		return (
			u.protocol === 'https:' &&
			u.port === '' &&
			u.host === `cl-o.${idTag}` &&
			/^\/api\/files\/[A-Za-z0-9._~-]+$/.test(u.pathname)
		)
	} catch {
		return false
	}
}

/**
 * true = saved, false = failed, undefined = handed to Android's DownloadManager,
 * whose own notification reports the outcome.
 */
export async function handleDownload(
	evt: DownloadEvent,
	getToken: (idTag: string, hat?: string) => Promise<string | undefined>
): Promise<boolean | undefined> {
	if (evt.error) return false
	if (evt.url.startsWith('blob:') || evt.url.startsWith('data:')) {
		return sendBlob(evt.reqId, evt.url)
	}
	// Tokens are minted for whatever `idTag` native names: the trusted host plus this
	// `isTenantUrl` check bound that to file-download URLs on that tenant (bad hat: the SW's 400)
	const token =
		evt.idTag &&
		isTenantUrl(evt.url, evt.idTag) &&
		(evt.hat === undefined || isValidIdTag(evt.hat))
			? await getToken(evt.idTag, evt.hat)
			: undefined
	try {
		await nativeRequest('downloadToken', { reqId: evt.reqId, token })
		return undefined
	} catch {
		return false
	}
}

/**
 * Called once from `Layout`. In the app: answers `download` events, and once the
 * owner is signed in, hands native a device key if it has none.
 */
export function useNativeBridge(auth: AuthState | null | undefined): void {
	const { t } = useTranslation()
	const toast = useToast()
	const { getTokenFor } = useApiContext()
	const idTag = auth?.idTag
	const signedIn = !!auth?.token
	React.useEffect(
		function nativeDownloads() {
			if (!isNativeApp()) return
			// Explicit: a download is user-initiated (the SW mints unconditionally). Own tenant
			// ignores the hat, like the SW. A failed mint proceeds unauthenticated, like the SW.
			const getToken = (target: string, hat?: string) =>
				getTokenFor(target, {
					explicit: true,
					hat: target === idTag ? undefined : hat
				}).then(
					(r) => r?.token,
					(err) => {
						console.warn(
							'[native] download proxy-token failed:',
							err instanceof Error ? err.message : err
						)
						return undefined
					}
				)
			return onNativeEvent<DownloadEvent>('download', (evt) => {
				void handleDownload(evt, getToken).then((ok) => {
					const name = evt.fileName ?? ''
					if (ok === true) toast.success(t('Downloaded {{name}}', { name }))
					else if (ok === false) toast.error(t('Download failed: {{name}}', { name }))
				})
			})
		},
		[t, toast, getTokenFor, idTag]
	)

	React.useEffect(
		function nativeDeviceKey() {
			if (!isNativeApp() || !idTag || !signedIn) return
			void ensureDeviceKey(idTag)
		},
		[idTag, signedIn]
	)
}

// vim: ts=4
