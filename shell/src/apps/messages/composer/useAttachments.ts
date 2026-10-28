// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { getUploadErrorMessage } from '../../../upload-errors.js'

/** A message carries either up to this many images… */
export const MAX_IMAGE_ATTACHMENTS = 10
/** …or exactly this many non-image files (video, document, PDF). Never both. */
export const MAX_FILE_ATTACHMENTS = 1

/** MSG subType per attachment kind: `IMG` renders as an image grid, `FILE` as a file card */
export const ATTACHMENT_SUBTYPE = { image: 'IMG', file: 'FILE' } as const

export type AttachmentKind = keyof typeof ATTACHMENT_SUBTYPE

export interface PendingAttachment {
	key: string
	name: string
	isImage: boolean
	/** Object URL of the local data (images only), for the chip thumbnail and the crop */
	previewUrl?: string
	/** 0-100 while uploading */
	progress?: number
	uploading: boolean
	fileId?: string
	error?: string
}

export interface UseAttachments {
	items: PendingAttachment[]
	kind: AttachmentKind | undefined
	/** MSG subType for the current attachments (undefined when none) */
	subType: string | undefined
	/** Uploaded file ids, in order */
	attachmentIds: string[]
	uploading: boolean
	failed: boolean
	/** Inline explanation of the last refused add (rule violation) */
	refusal: string | undefined
	clearRefusal: () => void
	add: (files: File[]) => void
	remove: (key: string) => void
	retry: (key: string) => void
	/** Replace an image's data with a cropped blob and re-upload it */
	replace: (key: string, blob: Blob) => void
	reset: () => void
}

function isImageFile(file: File): boolean {
	return file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.svg')
}

/** Why `files` can't join the `current` attachments (the image/file rule), or undefined. */
export function attachmentRefusal(
	current: { isImage: boolean }[],
	files: File[],
	t: TFunction
): string | undefined {
	const images = files.filter(isImageFile)
	const others = files.length - images.length
	const hasImages = current.some((i) => i.isImage)
	const hasFile = current.some((i) => !i.isImage)
	if (others && (images.length || hasImages)) {
		return t("Images and other files can't be sent in the same message.")
	}
	if (others && (hasFile || others > MAX_FILE_ATTACHMENTS)) {
		return t('Only one file can be attached to a message.')
	}
	if (images.length && hasFile) {
		return t("Images and other files can't be sent in the same message.")
	}
	if (current.length + images.length > MAX_IMAGE_ATTACHMENTS) {
		return t('At most {{count}} images can be attached to a message.', {
			count: MAX_IMAGE_ATTACHMENTS
		})
	}
}

function presetFor(contentType: string, isImage: boolean): string {
	if (isImage) return 'image'
	if (contentType.startsWith('video/')) return 'video'
	return 'default'
}

interface Source {
	data: Blob
	contentType: string
	isImage: boolean
}

let keySeq = 0

/** Chat attachments: several parallel uploads with progress, under the image/file rule. */
export function useAttachments(): UseAttachments {
	const { t } = useTranslation()
	const { api } = useApi()
	const [items, setItems] = React.useState<PendingAttachment[]>([])
	const [refusal, setRefusal] = React.useState<string | undefined>()
	const itemsRef = React.useRef(items)
	itemsRef.current = items
	const sources = React.useRef(new Map<string, Source>())
	const aborts = React.useRef(new Map<string, AbortController>())

	const patch = React.useCallback((key: string, p: Partial<PendingAttachment>) => {
		setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)))
	}, [])

	const upload = React.useCallback(
		async (key: string) => {
			const src = sources.current.get(key)
			if (!api || !src) return
			aborts.current.get(key)?.abort()
			const ac = new AbortController()
			aborts.current.set(key, ac)
			patch(key, {
				uploading: true,
				progress: undefined,
				error: undefined,
				fileId: undefined
			})
			try {
				const res = await api.files.uploadBlob(
					presetFor(src.contentType, src.isImage),
					'attachment',
					src.data,
					src.contentType || undefined,
					{
						as: 'managed',
						onProgress: (progress) => patch(key, { progress }),
						signal: ac.signal
					}
				)
				if (aborts.current.get(key) === ac) {
					patch(
						key,
						res?.fileId
							? { fileId: res.fileId }
							: { error: getUploadErrorMessage(t, undefined) }
					)
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return
				if (aborts.current.get(key) === ac) {
					patch(key, { error: getUploadErrorMessage(t, err) })
				}
			} finally {
				if (aborts.current.get(key) === ac) {
					aborts.current.delete(key)
					patch(key, { uploading: false, progress: undefined })
				}
			}
		},
		[api, t, patch]
	)

	const drop = React.useCallback((key: string) => {
		aborts.current.get(key)?.abort()
		aborts.current.delete(key)
		sources.current.delete(key)
		const it = itemsRef.current.find((i) => i.key === key)
		if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
	}, [])

	const add = React.useCallback(
		(files: File[]) => {
			if (!files.length) return
			const current = itemsRef.current
			const refused = attachmentRefusal(current, files, t)
			setRefusal(refused)
			if (refused) return
			const added = files.map((file): PendingAttachment => {
				const key = `att-${++keySeq}`
				const isImage = isImageFile(file)
				const contentType =
					file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '')
				sources.current.set(key, { data: file, contentType, isImage })
				return {
					key,
					name: file.name,
					isImage,
					previewUrl: isImage ? URL.createObjectURL(file) : undefined,
					uploading: true
				}
			})
			// Eagerly, so a second add in the same tick checks the limits against these
			itemsRef.current = [...current, ...added]
			setItems((prev) => [...prev, ...added])
			for (const it of added) upload(it.key)
		},
		[t, upload]
	)

	const remove = React.useCallback(
		(key: string) => {
			drop(key)
			setItems((prev) => prev.filter((i) => i.key !== key))
		},
		[drop]
	)

	const replace = React.useCallback(
		(key: string, blob: Blob) => {
			const src = sources.current.get(key)
			if (!src) return
			const it = itemsRef.current.find((i) => i.key === key)
			if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
			sources.current.set(key, {
				...src,
				data: blob,
				contentType: blob.type || src.contentType
			})
			patch(key, { previewUrl: URL.createObjectURL(blob) })
			upload(key)
		},
		[patch, upload]
	)

	const reset = React.useCallback(() => {
		for (const it of itemsRef.current) drop(it.key)
		setItems([])
		setRefusal(undefined)
	}, [drop])

	// Abort uploads and free object URLs on unmount.
	React.useEffect(() => reset, [reset])

	const kind: AttachmentKind | undefined = !items.length
		? undefined
		: items[0].isImage
			? 'image'
			: 'file'
	return {
		items,
		kind,
		subType: kind && ATTACHMENT_SUBTYPE[kind],
		attachmentIds: items.flatMap((i) => (i.fileId ? [i.fileId] : [])),
		uploading: items.some((i) => i.uploading),
		failed: items.some((i) => !!i.error),
		refusal,
		clearRefusal: React.useCallback(() => setRefusal(undefined), []),
		add,
		remove,
		retry: upload,
		replace,
		reset
	}
}

// vim: ts=4
