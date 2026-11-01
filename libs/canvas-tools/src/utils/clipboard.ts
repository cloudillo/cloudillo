// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * System-clipboard codec for canvas objects.
 *
 * The payload travels as `text/plain`: a fixed prefix followed by JSON tagged with the app id,
 * so it crosses boards and tabs of the same app, while another app (or a stray text paste) is
 * recognised and ignored.
 */

import { createApiClient, isFileId, isIdTag } from '@cloudillo/core'

export const CANVAS_CLIPBOARD_PREFIX = 'cloudillo-canvas:v1'

export function encodeCanvasClipboard<T extends object>(app: string, payload: T): string {
	return `${CANVAS_CLIPBOARD_PREFIX}${JSON.stringify({ ...payload, app })}`
}

/** Clipboard text longer than this is not decoded: one cap bounds every string and array in it */
export const MAX_CANVAS_CLIPBOARD_CHARS = 8_000_000

/** The payload, or null when the text is not ours, is malformed, or belongs to another app */
export function decodeCanvasClipboard<T>(text: string, app: string): T | null {
	if (!text.startsWith(CANVAS_CLIPBOARD_PREFIX)) return null
	if (text.length > MAX_CANVAS_CLIPBOARD_CHARS) return null
	try {
		const data = JSON.parse(text.slice(CANVAS_CLIPBOARD_PREFIX.length))
		if (!data || typeof data !== 'object' || data.app !== app) return null
		return data as T
	} catch {
		return null
	}
}

/**
 * How far to move a pasted payload: centred on `at` (the last canvas pointer position), or
 * `nudge` units down-right of the originals when the pointer never was over the canvas.
 */
export function canvasPasteOffset(
	bounds: { x: number; y: number; width: number; height: number } | undefined,
	at: [number, number] | null,
	nudge = 20
): [number, number] {
	if (!at || !bounds) return [nudge, nudge]
	const cx = bounds.x + bounds.width / 2
	const cy = bounds.y + bounds.height / 2
	if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [nudge, nudge]
	return [at[0] - cx, at[1] - cy]
}

/** The document a payload was copied from: its file references belong to it */
export interface CanvasClipboardSource {
	fileId: string
	ownerTag: string
}

/** A well-formed `bounds` from an untrusted clipboard payload */
export function isBounds(v: unknown): v is { x: number; y: number; width: number; height: number } {
	if (!v || typeof v !== 'object') return false
	const { x, y, width, height } = v as Record<string, unknown>
	return (
		[x, y, width, height].every((n) => Number.isFinite(n)) &&
		(width as number) >= 0 &&
		(height as number) >= 0
	)
}

/** A well-formed `source` from an untrusted clipboard payload, else undefined */
export function clipboardSource(v: unknown): CanvasClipboardSource | undefined {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
	const { fileId, ownerTag } = v as Record<string, unknown>
	return typeof fileId === 'string' && typeof ownerTag === 'string'
		? { fileId, ownerTag }
		: undefined
}

/** True when the payload was copied from another document (or records no source) */
export function isForeignClipboard(
	source: CanvasClipboardSource | undefined,
	fileId: string
): boolean {
	return source?.fileId !== fileId
}

/**
 * Link every referenced file into the target document, one at a time (each may ask the user),
 * through `link` (the app bus `linkDocument`). Returns the file ids that could not be linked:
 * refused, cancelled, failed, an unresolved `@` temp id, or not id-shaped (the payload came off
 * the system clipboard, so `ownerTag` and the ids are untrusted). Objects using them must be
 * dropped.
 */
export async function linkClipboardFiles(
	fileIds: Iterable<string>,
	ownerTag: string,
	link: (ref: string) => Promise<unknown>
): Promise<Set<string>> {
	const failed = new Set<string>()
	const ownerOk = isIdTag(ownerTag)
	for (const id of new Set(fileIds)) {
		const ok =
			ownerOk &&
			isFileId(id) &&
			!id.startsWith('@') &&
			(await link(`cl:file/${ownerTag}:${id}`).catch(() => null))
		if (!ok) failed.add(id)
	}
	return failed
}

/** The first image file on a paste (screenshot or copied file), or null */
export function clipboardImageFile(data: DataTransfer | null): File | null {
	if (!data) return null
	for (const file of Array.from(data.files)) {
		if (file.type.startsWith('image/')) return file
	}
	for (const item of Array.from(data.items)) {
		if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
	}
	return null
}

/** A URL-safe upload name for a pasted image (`image/svg+xml` → `pasted-<ts>.svg`) */
export function pastedImageName(type: string): string {
	const ext = (type.split('/')[1] ?? '').replace(/\W.*$/, '') || 'png'
	return `pasted-${Date.now()}.${ext}`
}

/** No file ref, or an id-shaped one (`@` pending-upload ids included) */
export function hasValidFileRef(fid: unknown): boolean {
	return fid === undefined || (typeof fid === 'string' && isFileId(fid))
}

/** File ids (images, embedded documents) the items reference, read through `fid` */
export function clipboardFileIds<T>(items: readonly T[], fid: (item: T) => unknown): string[] {
	return (Array.isArray(items) ? items : [])
		.map(fid)
		.filter((id): id is string => typeof id === 'string')
}

/** The items minus those referencing a file that could not be linked */
export function withoutFileRefs<T>(
	items: readonly T[],
	fid: (item: T) => unknown,
	failed: Set<string>
): T[] {
	const list = Array.isArray(items) ? items : []
	if (!failed.size) return [...list]
	return list.filter((item) => {
		const id = fid(item)
		return !(typeof id === 'string' && failed.has(id))
	})
}

/**
 * A payload copied from another document has its files linked into `fileId` first (through
 * `link`, the app bus `linkDocument`); objects whose file could not be linked are dropped.
 * The source is untrusted clipboard text, so one claiming this document is trusted only for
 * files it already references (`known`); the rest go through the link path under `ownerTag`
 * (this document's owner). `failed` counts the files that could not be linked.
 */
export async function resolveForeignPaste<
	P extends { source?: CanvasClipboardSource; objects: unknown[] }
>(
	payload: P,
	fileId: string,
	fid: (item: P['objects'][number]) => unknown,
	link: (ref: string) => Promise<unknown>,
	known: ReadonlySet<unknown>,
	ownerTag: string
): Promise<{ payload: P; failed: number }> {
	const foreign = isForeignClipboard(payload.source, fileId)
	const ids = clipboardFileIds(payload.objects, fid).filter(
		(id) => foreign || (!id.startsWith('@') && !known.has(id))
	)
	if (!ids.length) return { payload, failed: 0 }
	const failed = await linkClipboardFiles(
		ids,
		foreign ? (payload.source?.ownerTag ?? '') : ownerTag,
		link
	)
	if (!failed.size) return { payload, failed: 0 }
	return {
		payload: { ...payload, objects: withoutFileRefs(payload.objects, fid, failed) },
		failed: failed.size
	}
}

/**
 * Upload a pasted image as a media file under document `fileId`, on the owner's node. The size
 * falls back to `defaultSize` square when the server reports none.
 */
export async function uploadPastedImage(
	ctx: { ownerTag: string; token?: string; fileId: string },
	file: File,
	defaultSize: number
): Promise<{ fileId: string; width: number; height: number }> {
	const api = createApiClient({ idTag: ctx.ownerTag, authToken: ctx.token })
	const res = await api.files.uploadBlob('media', pastedImageName(file.type), file, file.type, {
		rootId: ctx.fileId
	})
	const [width, height] = res.dim ?? [defaultSize, defaultSize]
	return { fileId: res.fileId, width, height }
}

// vim: ts=4
