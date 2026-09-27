// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Breadcrumbs,
	Button,
	FileTile,
	Image,
	ImageCropper,
	type ImageCropRect,
	Thumbnail,
	VideoPlayer
} from '@cloudillo/react'
import * as React from 'react'
import { LuHouse as IcHome, LuPlay as IcPlay } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

const PHOTO = 'https://picsum.photos/seed/cloudillo/480/320'
const SQUARE = 'https://picsum.photos/seed/cloudillo-sq/256/256'

export function ImageStory() {
	return (
		<Story
			name="Image"
			description="<img> with preload and retry: a Skeleton of the same box while loading, a broken-image state with manual retry once attempts run out."
			props={[
				{ name: 'src', type: 'string | undefined', descr: 'Undefined is the error state' },
				{ name: 'alt', type: 'string', descr: 'Required; "" marks it decorative' },
				{ name: 'aspect', type: 'number | string', descr: 'CSS aspect-ratio' },
				{ name: 'fit', type: "'cover' | 'contain'", descr: 'CSS object-fit' },
				{ name: 'fallback', type: 'ReactNode', descr: 'Replaces the default error state' },
				{ name: 'maxAttempts', type: 'number', descr: 'Load attempts (default 5)' }
			]}
		>
			<Variant name="Loaded / broken / missing">
				<div className="c-hbox g-2 align-items-start">
					<Image
						src={PHOTO}
						alt="Sample photo"
						aspect="3 / 2"
						fit="cover"
						style={{ width: 240 }}
					/>
					<Image
						src="https://invalid.example/nope.jpg"
						alt="Broken"
						aspect="3 / 2"
						maxAttempts={1}
						style={{ width: 160 }}
					/>
					<Image src={undefined} alt="" aspect={1} style={{ width: 96 }} />
				</div>
			</Variant>
		</Story>
	)
}

export function ThumbnailStory() {
	return (
		<Story
			name="Thumbnail"
			description="Square, cropped Image; a link or button with href / onClick."
			props={[
				{ name: 'src', type: 'string | undefined', descr: 'Image URL' },
				{ name: 'alt', type: 'string', descr: 'Required' },
				{
					name: 'size',
					type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
					descr: '32/48/64/96/128px, default md'
				},
				{ name: 'icon', type: 'ReactNode', descr: 'Corner badge' },
				{
					name: 'href / onClick',
					type: 'string / handler',
					descr: 'Makes it a link / button'
				}
			]}
		>
			<Variant name="Sizes">
				<div className="c-hbox g-2 align-items-end">
					<Thumbnail src={SQUARE} alt="" size="xs" />
					<Thumbnail src={SQUARE} alt="" size="sm" />
					<Thumbnail src={SQUARE} alt="Open photo" onClick={() => {}} />
					<Thumbnail src={SQUARE} alt="Play video" size="lg" icon={<IcPlay />} href="#" />
				</div>
			</Variant>
		</Story>
	)
}

export function FileTileStory() {
	const [sel, setSel] = React.useState(false)
	return (
		<Story
			name="FileTile"
			description="Grid tile: preview or FileTypeIcon, name (stretched link), meta, hover actions."
			props={[
				{ name: 'name', type: 'ReactNode', descr: 'The stretched link / button' },
				{ name: 'meta', type: 'ReactNode', descr: 'Secondary line' },
				{ name: 'src', type: 'string', descr: 'Preview; otherwise the type icon' },
				{ name: 'contentType', type: 'string', descr: 'MIME type for the icon' },
				{ name: 'selected', type: 'boolean', descr: 'Selected look + check mark' },
				{ name: 'actions', type: 'ReactNode', descr: 'Hover-revealed actions' },
				{ name: 'href / onClick', type: 'string / handler', descr: 'Tile target' }
			]}
		>
			<Variant name="Grid">
				<div className="c-hbox g-2 align-items-start">
					<FileTile
						name="Holiday.jpg"
						meta="1.2 MB"
						src={SQUARE}
						style={{ width: 160 }}
						href="#"
					/>
					<FileTile
						name="Documents"
						meta="12 items"
						contentType="cloudillo/folder"
						style={{ width: 160 }}
						selected={sel}
						onClick={() => setSel(!sel)}
					/>
					<FileTile
						name="Notes"
						meta="Edited today"
						contentType="cloudillo/quillo"
						style={{ width: 160 }}
						href="#"
					/>
				</div>
			</Variant>
		</Story>
	)
}

export function VideoPlayerStory() {
	return (
		<Story
			name="VideoPlayer"
			description='The one place <video> renders: native controls, preload="none", processing and error states. The ref is the <video>.'
			props={[
				{
					name: 'src / poster',
					type: 'string',
					descr: 'Native video attributes pass through'
				},
				{
					name: 'processing',
					type: 'boolean',
					descr: 'Transcoding placeholder (role=status)'
				},
				{ name: 'inverse', type: 'boolean', descr: 'Light-on-dark placeholder' },
				{
					name: 'aspect',
					type: 'number | string',
					descr: 'Placeholder aspect-ratio (16 / 9)'
				}
			]}
		>
			<Variant name="States">
				<div className="c-hbox g-2 align-items-start">
					<VideoPlayer poster={PHOTO} style={{ width: 240 }} />
					<VideoPlayer processing style={{ width: 240 }} />
					<VideoPlayer
						src="https://invalid.example/nope.mp4"
						preload="auto"
						style={{ width: 240 }}
					/>
				</div>
			</Variant>
		</Story>
	)
}

export function ImageCropperStory() {
	const [crop, setCrop] = React.useState<ImageCropRect>()
	return (
		<Story
			name="ImageCropper"
			description="ReactCrop with an aspect-preset toolbar. Fills its parent; the caller encodes the crop from the loaded <img>."
			props={[
				{ name: 'src', type: 'string', descr: 'Image URL' },
				{
					name: 'aspects',
					type: "ImageCropAspect[] ('4:1' … '1:1' | 'circle' | '')",
					descr: "Presets; the first non-free one applies on load, '' is free"
				},
				{
					name: 'onCropChange',
					type: '(crop?: ImageCropRect) => void',
					descr: 'Crop in displayed-image pixels'
				},
				{ name: 'onImageLoad', type: '(img) => void', descr: 'The loaded <img>' },
				{ name: 'disabled', type: 'boolean', descr: 'Dims and blocks it (busy)' },
				{
					name: 'status',
					type: 'ReactNode',
					descr: 'Replaces the presets (progress, error)'
				},
				{ name: 'actions', type: 'ReactNode', descr: 'Trailing toolbar buttons' }
			]}
		>
			<Variant name="Presets + actions">
				<div style={{ height: 420 }}>
					<ImageCropper
						src={PHOTO}
						aspects={['', '16:9', '1:1', 'circle']}
						onCropChange={setCrop}
						actions={<Button color="primary">Upload</Button>}
					/>
				</div>
				<div>
					{crop
						? `${Math.round(crop.width)} × ${Math.round(crop.height)} at ${Math.round(crop.x)}, ${Math.round(crop.y)}`
						: 'No crop'}
				</div>
			</Variant>
		</Story>
	)
}

export function BreadcrumbsStory() {
	const items = [
		{ label: 'Home', icon: <IcHome />, href: '#' },
		{ label: 'Projects', href: '#' },
		{ label: 'Cloudillo', href: '#' },
		{ label: 'Design', href: '#' },
		{ label: 'Icons' }
	]
	return (
		<Story
			name="Breadcrumbs"
			description='Path trail; the last item is aria-current="page". maxItems collapses the middle into an expandable "…".'
			props={[
				{ name: 'items', type: '{ label, icon?, href?, onClick? }[]', descr: 'The trail' },
				{ name: 'maxItems', type: 'number', descr: 'Collapse above this many' },
				{ name: 'label', type: 'string', descr: 'nav aria-label (default "Breadcrumb")' }
			]}
		>
			<Variant name="Full">
				<Breadcrumbs items={items} />
			</Variant>
			<Variant name="Collapsed (maxItems=3)">
				<Breadcrumbs items={items} maxItems={3} />
			</Variant>
		</Story>
	)
}

// vim: ts=4
