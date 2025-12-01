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

export interface UseImageUploadReturn {
	attachment: string | undefined
	attachmentIds: string[]
	isUploading: boolean
	selectFile: (file: File) => void
	uploadAttachment: (blob: Blob) => Promise<void>
	removeAttachment: (id: string) => void
	cancelCrop: () => void
	reset: () => void
}

export function useImageUpload(options?: UseImageUploadOptions): UseImageUploadReturn {
	const [auth] = useAuth()
	const [attachment, setAttachment] = React.useState<string | undefined>()
	const [attachmentIds, setAttachmentIds] = React.useState<string[]>([])
	const [isUploading, setIsUploading] = React.useState(false)

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

	const removeAttachment = React.useCallback((id: string) => {
		setAttachmentIds(ids => ids.filter(i => i !== id))
	}, [])

	const cancelCrop = React.useCallback(() => {
		setAttachment(undefined)
	}, [])

	const reset = React.useCallback(() => {
		setAttachment(undefined)
		setAttachmentIds([])
		setIsUploading(false)
	}, [])

	return {
		attachment,
		attachmentIds,
		isUploading,
		selectFile,
		uploadAttachment,
		removeAttachment,
		cancelCrop,
		reset
	}
}

// vim: ts=4
