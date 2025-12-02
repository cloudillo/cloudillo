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

import * as React from 'react'
import { useAuth } from '@cloudillo/react'

export interface UseImageUploadOptions {
	onUploadComplete?: (fileId: string) => void
}

export type AttachmentType = 'image' | 'video' | undefined

export interface UseImageUploadReturn {
	attachment: string | undefined
	attachmentIds: string[]
	attachmentType: AttachmentType
	isUploading: boolean
	uploadProgress: number | undefined
	selectFile: (file: File) => void
	uploadAttachment: (blob: Blob) => Promise<void>
	uploadVideo: (file: File) => Promise<void>
	removeAttachment: (id: string) => void
	cancelCrop: () => void
	reset: () => void
}

export function useImageUpload(options?: UseImageUploadOptions): UseImageUploadReturn {
	const [auth] = useAuth()
	const [attachment, setAttachment] = React.useState<string | undefined>()
	const [attachmentIds, setAttachmentIds] = React.useState<string[]>([])
	const [attachmentType, setAttachmentType] = React.useState<AttachmentType>(undefined)
	const [isUploading, setIsUploading] = React.useState(false)
	const [uploadProgress, setUploadProgress] = React.useState<number | undefined>()

	const selectFile = React.useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = function (evt) {
			if (typeof evt?.target?.result === 'string') {
				setAttachment(evt.target.result)
			}
		}
		reader.readAsDataURL(file)
	}, [])

	const uploadAttachment = React.useCallback(async (blob: Blob) => {
		if (!auth) return

		setIsUploading(true)

		const request = new XMLHttpRequest()
		request.open('POST', `https://cl-o.${auth.idTag}/api/file/image/attachment`)
		request.setRequestHeader('Authorization', `Bearer ${auth.token}`)

		request.addEventListener('load', function () {
			setIsUploading(false)
			const j = JSON.parse(request.response)
			const fileId = j?.data?.fileId
			if (fileId) {
				setAttachmentIds(ids => [...ids, fileId])
				setAttachmentType('image')
				options?.onUploadComplete?.(fileId)
			}
			setAttachment(undefined)
		})

		request.addEventListener('error', function () {
			setIsUploading(false)
			console.error('Upload failed')
		})

		request.send(blob)
	}, [auth, options])

	const uploadVideo = React.useCallback(async (file: File) => {
		if (!auth) return

		setIsUploading(true)
		setUploadProgress(0)

		const request = new XMLHttpRequest()
		request.open('POST', `https://cl-o.${auth.idTag}/api/file/video/attachment`)
		request.setRequestHeader('Authorization', `Bearer ${auth.token}`)

		request.upload.addEventListener('progress', (e) => {
			if (e.lengthComputable) {
				setUploadProgress(Math.round((e.loaded / e.total) * 100))
			}
		})

		request.addEventListener('load', function () {
			setIsUploading(false)
			setUploadProgress(undefined)
			const j = JSON.parse(request.response)
			const fileId = j?.data?.fileId
			if (fileId) {
				setAttachmentIds(ids => [...ids, fileId])
				setAttachmentType('video')
				options?.onUploadComplete?.(fileId)
			}
		})

		request.addEventListener('error', function () {
			setIsUploading(false)
			setUploadProgress(undefined)
			console.error('Video upload failed')
		})

		request.send(file)
	}, [auth, options])

	const removeAttachment = React.useCallback((id: string) => {
		setAttachmentIds(ids => {
			const newIds = ids.filter(i => i !== id)
			if (newIds.length === 0) {
				setAttachmentType(undefined)
			}
			return newIds
		})
	}, [])

	const cancelCrop = React.useCallback(() => {
		setAttachment(undefined)
	}, [])

	const reset = React.useCallback(() => {
		setAttachment(undefined)
		setAttachmentIds([])
		setAttachmentType(undefined)
		setIsUploading(false)
		setUploadProgress(undefined)
	}, [])

	return {
		attachment,
		attachmentIds,
		attachmentType,
		isUploading,
		uploadProgress,
		selectFile,
		uploadAttachment,
		uploadVideo,
		removeAttachment,
		cancelCrop,
		reset
	}
}

// vim: ts=4
