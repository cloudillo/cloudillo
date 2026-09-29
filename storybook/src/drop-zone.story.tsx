// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { DropZone, FileButton } from '@cloudillo/react'
import * as React from 'react'
import { LuImage, LuUpload } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

function describe(files: File[]) {
	return files.map((f) => `${f.name} (${f.size} B)`).join(', ')
}

export function DropZoneStory() {
	const [picked, setPicked] = React.useState('')
	const [dropped, setDropped] = React.useState('')
	const [page, setPage] = React.useState('')
	const [viewport, setViewport] = React.useState(false)

	return (
		<Story
			name="DropZone"
			title="DropZone / FileButton"
			description="File input by drop or picker. Both share one hidden-input helper (useFilePicker) and the same onFiles(files: File[]) callback."
			props={[
				{
					name: 'onFiles',
					type: '(files: File[]) => void',
					descr: 'Dropped or picked files'
				},
				{ name: 'accept', type: 'string', descr: '".png,image/*" — filters drops too' },
				{
					name: 'multiple',
					type: 'boolean',
					descr: 'DropZone default true, FileButton false'
				},
				{
					name: 'variant',
					type: '"area" | "overlay"',
					descr: 'DropZone look (default area)'
				},
				{ name: 'target', type: '"parent" | "viewport"', descr: 'Overlay: page-wide drop' },
				{ name: 'icon / title / hint', type: 'ReactNode', descr: 'Area slots' },
				{ name: 'hover', type: 'ReactNode', descr: 'Content while dragging' }
			]}
		>
			<Variant name="FileButton">
				<div className="c-vbox g-2">
					<div className="c-hbox g-2">
						<FileButton icon={<LuUpload />} onFiles={(f) => setPicked(describe(f))}>
							Upload file
						</FileButton>
						<FileButton
							accept="image/*"
							multiple
							variant="soft"
							icon={<LuImage />}
							aria-label="Upload images"
							onFiles={(f) => setPicked(describe(f))}
						/>
					</div>
					<p>{picked || 'Nothing picked'}</p>
				</div>
			</Variant>

			<Variant name="Area (click, Enter/Space or drop)">
				<div className="c-vbox g-2">
					<DropZone
						accept="image/*"
						hint="PNG, JPG or WebP"
						onFiles={(f) => setDropped(describe(f))}
					/>
					<p>{dropped || 'Nothing dropped'}</p>
				</div>
			</Variant>

			<Variant name="Area disabled">
				<DropZone disabled onFiles={() => {}} />
			</Variant>

			<Variant name="Overlay (drag files over the box)">
				<DropZone variant="overlay" onFiles={(f) => setDropped(describe(f))}>
					<div className="p-4" style={{ minHeight: '6rem' }}>
						Regular content — the overlay shows only while dragging files here.
					</div>
				</DropZone>
			</Variant>

			<Variant name='Overlay target="viewport"'>
				<div className="c-vbox g-2">
					<label className="c-hbox g-2">
						<input
							type="checkbox"
							checked={viewport}
							onChange={(e) => setViewport(e.target.checked)}
						/>
						Enable page-wide drop
					</label>
					{viewport && (
						<DropZone
							variant="overlay"
							target="viewport"
							onFiles={(f) => setPage(describe(f))}
						/>
					)}
					<p>{page || 'Drop anywhere on the page'}</p>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
