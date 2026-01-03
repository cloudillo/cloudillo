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

import React from 'react'
import { useTranslation, Trans } from 'react-i18next'
import ReactCrop, { Crop } from 'react-image-crop'

import { LuSquareDashed as IcBoxSelect, LuCircleDashed as IcCircleSelect } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

export type Aspect = '4:1' | '3:1' | '2:1' | '16:9' | '3:2' | '4:3' | '1:1' | 'circle' | ''
const aspectMap = {
	// Aspect ratio = aspect / 36
	'4:1': 144,
	'3:1': 108,
	'2:1': 72,
	'16:9': 64,
	'3:2': 54,
	'4:3': 48,
	'1:1': 36,
	circle: 36,
	'': undefined
}

// Utility functions
export function getBestImageId(hashData: string, intent: 'orig' | 'hd' | 'sd' | 'tn') {
	// Handle plain file ID (no version prefix)
	if (!hashData.includes(':')) {
		return hashData
	}

	const [ver, hashesStr] = hashData.split(':')
	const hashes = hashesStr.split(',')

	if (intent == 'tn') {
		const idx =
			ver.indexOf('t') + 1 ||
			ver.indexOf('s') + 1 ||
			ver.indexOf('h') + 1 ||
			ver.indexOf('o') + 1
		if (idx) return hashes[idx - 1]
	}
	if (intent == 'hd') {
		const idx =
			ver.indexOf('h') + 1 ||
			ver.indexOf('o') + 1 ||
			ver.indexOf('s') + 1 ||
			ver.indexOf('t') + 1
		if (idx) return hashes[idx - 1]
	}
	if (intent == 'sd') {
		const idx =
			ver.indexOf('s') + 1 ||
			ver.indexOf('h') + 1 ||
			ver.indexOf('t') + 1 ||
			ver.indexOf('o') + 1
		if (idx) return hashes[idx - 1]
	}
}

export function ImageUpload({
	src,
	aspects,
	onSubmit,
	onCancel,
	embedded
}: {
	src: string
	aspects?: Aspect[]
	onSubmit: (blob: Blob) => void
	onCancel: () => void
	embedded?: boolean // When true, renders without modal wrapper to fit inside a container
}) {
	const { t } = useTranslation()
	const [aspect, setAspect] = React.useState<Aspect>() // Aspect ratio = aspect / 36
	const imgRef = React.useRef<HTMLImageElement>(null)
	const [crop, setCrop] = React.useState<Crop>()

	function handleImageLoaded(evt: React.SyntheticEvent<HTMLImageElement>) {
		console.log('handleImageLoaded', aspects)
		// Use first aspect if available (check length, not value, since '' is valid for free)
		if (aspects?.length && aspects[0] !== '') changeAspect(aspects[0])
	}

	function changeCrop(newCrop: Crop, percCrop: Crop) {
		//console.log('changeCrop', newCrop, percCrop)
		setCrop(newCrop)
	}

	function changeAspect(aspect: Aspect) {
		const newAspect = aspectMap[aspect]
		const w = imgRef.current!.naturalWidth,
			h = imgRef.current!.naturalHeight
		const zoom = w / imgRef.current!.width
		if (!newAspect) return setAspect(undefined)
		const [width, height] =
			w / h <= newAspect / 36 ? [w, (w / newAspect) * 36] : [(h * newAspect) / 36, h]
		setCrop({
			x: (w - width) / 2 / zoom,
			y: (h - height) / 2 / zoom,
			width: width / zoom,
			height: height / zoom,
			unit: 'px'
		})
		setAspect(aspect)
	}

	async function handleSubmit() {
		console.log('submit', crop)
		const myCrop = crop || {
			x: 0,
			y: 0,
			width: imgRef.current!.width,
			height: imgRef.current!.height
		}
		const zoom = imgRef.current!.naturalWidth / imgRef.current!.width
		const canvas = document.createElement('canvas')
		//canvas.width = (crop?.width || imgRef.current!.naturalWidth) > 1920 ? 1920 : crop?.width || imgRef.current!.naturalWidth
		canvas.width = myCrop.width > 1920 ? 1920 : myCrop?.width
		canvas.height = (canvas.width * myCrop.height) / myCrop.width
		if (canvas.height > 1920) {
			canvas.height = 1920
			canvas.width = (canvas.height * myCrop.width) / myCrop.height
		}
		console.log('canvas size', canvas.width, canvas.height)
		canvas
			.getContext('2d')
			?.drawImage(
				imgRef.current!,
				myCrop.x * zoom,
				myCrop.y * zoom,
				myCrop.width * zoom,
				myCrop.height * zoom,
				0,
				0,
				canvas.width,
				canvas.height
			)
		const dataURI = canvas.toBlob(
			function (blob) {
				console.log(blob)
				if (!blob) return

				onSubmit(blob)
			},
			'image/jpeg',
			0.8
		)
	}

	/*
	React.useEffect(() => {
		console.log('crop', crop)
	}, [crop])
	*/

	const cropArea = embedded ? (
		<div className="crop-image-wrapper">
			<ReactCrop
				crop={crop}
				onChange={changeCrop}
				aspect={aspect ? aspectMap[aspect] / 36 : undefined}
				circularCrop={aspect == 'circle'}
			>
				<img
					ref={imgRef}
					src={src}
					onLoad={handleImageLoaded}
				/>
			</ReactCrop>
		</div>
	) : (
		<ReactCrop
			crop={crop}
			onChange={changeCrop}
			aspect={aspect ? aspectMap[aspect] / 36 : undefined}
			circularCrop={aspect == 'circle'}
		>
			<img
				ref={imgRef}
				src={src}
				onLoad={handleImageLoaded}
				style={{ maxWidth: '80vw', maxHeight: '80vh' }}
			/>
		</ReactCrop>
	)

	const toolbar = (
		<div className="crop-toolbar">
			<div className="crop-toolbar-aspects">
				{aspects?.map((asp) => (
					<button
						key={asp}
						className={`crop-aspect-btn ${aspect === asp ? 'active' : ''}`}
						onClick={() => changeAspect(asp)}
						title={asp === 'circle' ? t('Circle') : asp || t('Free')}
					>
						{asp == 'circle' ? <IcCircleSelect /> : asp || <IcBoxSelect />}
					</button>
				))}
			</div>
			<div className="crop-toolbar-actions">
				<Button onClick={onCancel}>{t('Cancel')}</Button>
				<Button primary onClick={handleSubmit}>
					{t('Upload')}
				</Button>
			</div>
		</div>
	)

	if (embedded) {
		return (
			<div className="image-upload-embedded">
				{cropArea}
				{toolbar}
			</div>
		)
	}

	return (
		<div className="c-modal show">
			<div className="c-panel g-1">
				{cropArea}
				{toolbar}
			</div>
		</div>
	)
}

// vim: ts=4
