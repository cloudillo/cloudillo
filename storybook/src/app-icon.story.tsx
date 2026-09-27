// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { APP_IDS, AppIcon, type AppIconSize, FileTypeIcon } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

const SIZES: AppIconSize[] = ['sm', 'md', 'lg']
const CONTENT_TYPES = [
	'image/png',
	'video/mp4',
	'application/pdf',
	'cloudillo/folder',
	'cloudillo/quillo',
	'cloudillo/taskillo',
	'text/plain'
]

export function AppIconStory() {
	return (
		<Story
			name="AppIcon"
			description="App glyphs from the icon atlas on a fixed-light squircle tile (same in both themes), or bare for list rows. Sizes are the ones the glyphs were drawn at: sm 20px, md 32px, lg 56px."
			props={[
				{ name: 'app', type: 'AppId', descr: 'App id, e.g. quillo' },
				{ name: 'size', type: "'sm' | 'md' | 'lg'", descr: 'Default md (32px)' },
				{
					name: 'tile',
					type: 'boolean',
					descr: 'Default true; false draws the bare glyph'
				},
				{ name: 'label', type: 'string', descr: 'Accessible name; omit when decorative' }
			]}
		>
			{SIZES.map((size) => (
				<Variant key={size} name={`Tile · ${size}`}>
					<div className="c-hbox g-2 flex-wrap">
						{APP_IDS.map((app) => (
							<AppIcon key={app} app={app} size={size} label={app} />
						))}
					</div>
				</Variant>
			))}
			{SIZES.slice(0, 2).map((size) => (
				<Variant key={size} name={`Bare · ${size}`}>
					<div className="c-hbox g-2 flex-wrap">
						{APP_IDS.map((app) => (
							<AppIcon key={app} app={app} size={size} tile={false} label={app} />
						))}
					</div>
				</Variant>
			))}
			<Variant name="FileTypeIcon · tile md, bare sm (contentType)">
				<div className="c-vbox g-2">
					<div className="c-hbox g-2 flex-wrap">
						{CONTENT_TYPES.map((ct) => (
							<FileTypeIcon key={ct} contentType={ct} label={ct} />
						))}
					</div>
					<div className="c-hbox g-2 flex-wrap">
						{CONTENT_TYPES.map((ct) => (
							<FileTypeIcon
								key={ct}
								contentType={ct}
								size="sm"
								tile={false}
								label={ct}
							/>
						))}
					</div>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
