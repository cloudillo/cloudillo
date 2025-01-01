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
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import PhotoAlbum from 'react-photo-album'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Slideshow from "yet-another-react-lightbox/plugins/slideshow"
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import "yet-another-react-lightbox/plugins/thumbnails.css"
import 'react-photo-album/rows.css'

import { useAuth, useApi, parseQS, qs } from '../utils.js'

interface File {
	fileId: string
	variantId: string
	fileName: string
	contentType: string
	createdAt: string
	preset: string
	tags?: string[]
	x?: {
		dim: [number, number]
		caption?: string
	}
}

export function GalleryApp() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const api = useApi()
	const [auth] = useAuth()
	const location = useLocation()
	const [refreshHelper, setRefreshHelper] = React.useState(false)
	const [files, setFiles] = React.useState<File[] | undefined>()
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()

	const photos = api && React.useMemo(() => files?.map(f => ({
		src: `https://cl-o.${auth?.idTag}/api/store/${f.variantId}`,
		width: f.x?.dim?.[0] || 100,
		height: f.x?.dim?.[1] || 100,
		title: f.x?.caption || f.fileName
	})), [files])

	React.useEffect(function loadImageList() {
		if (!api) return

		(async function () {
			const qs: Record<string, string> = parseQS(location.search)
			console.log('QS', location.search, qs)

			if (Object.keys(qs).length > 0 -1) {
				const res = await api.get<{ files: File[] }>('', '/store', {
					query: { variant: 'tn', preset: 'gallery', ...qs }
				})
				console.log('RES', res)
				setFiles(res.files)
			} else {
				setFiles([])
			}
		})()
	}, [api, location.search, refreshHelper])

	if (!photos) return null

	return <div className="m-panel h-100 overflow-y-scroll">
		<PhotoAlbum layout="rows" photos={photos} onClick={({ index }) => setLbIndex(index)}/>
		<Lightbox
			slides={photos}
			open={lbIndex !== undefined}
			index={lbIndex}
			close={() => setLbIndex(undefined)}
			plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
		/>
	</div>
}

// vim: ts=4
