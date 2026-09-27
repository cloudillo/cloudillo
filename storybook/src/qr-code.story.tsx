// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { QRCode } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function QRCodeStory() {
	return (
		<Story
			name="QRCode"
			description="A QR code on a white tile, so it scans in dark mode too. QRCodeDialog composes it."
			props={[
				{ name: 'value', type: 'string', descr: 'The URL or text to encode' },
				{
					name: 'size',
					type: 'number | string',
					descr: 'Maximum width (px or CSS length); default fills the container'
				},
				{
					name: 'label',
					type: 'string',
					descr: 'Accessible name; without it the code is aria-hidden'
				}
			]}
		>
			<Variant name="Sizes">
				<div className="c-hbox g-2 flex-wrap">
					<QRCode value="https://cloudillo.org" size={120} label="Cloudillo website" />
					<QRCode value="https://cloudillo.org" size={200} />
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
