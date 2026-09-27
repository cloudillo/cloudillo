// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Alert, Button } from '@cloudillo/react'
import * as React from 'react'
import { LuWifiOff } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function AlertStory() {
	const [shown, setShown] = React.useState(true)

	return (
		<Story
			name="Alert"
			description="Message alongside content: banner, notice, or an error not tied to a field. For a whole empty/failed area use EmptyState."
			props={[
				{
					name: 'color',
					type: '"info" | "success" | "warning" | "error" | "neutral"',
					descr: 'Tone (default: info); error/warning get role="alert", others role="status"'
				},
				{
					name: 'variant',
					type: '"soft" | "filled" | "outline"',
					descr: 'Surface style (default: soft)'
				},
				{ name: 'icon', type: 'ReactNode | false', descr: 'Overrides the tone icon' },
				{ name: 'title', type: 'ReactNode', descr: 'Bold first line' },
				{ name: 'actions', type: 'ReactNode', descr: 'At most one primary action' },
				{ name: 'compact', type: 'boolean', descr: 'Tighter padding and smaller text' },
				{ name: 'inverse', type: 'boolean', descr: 'Light-on-dark, for dark overlays' },
				{ name: 'onDismiss', type: '() => void', descr: 'Shows a close button' }
			]}
		>
			<Variant name="Colors">
				<div className="c-vbox g-2">
					<Alert title="Heads up">A new version is available.</Alert>
					<Alert color="success">Your changes were saved.</Alert>
					<Alert color="warning">Your storage is almost full.</Alert>
					<Alert color="error" title="Upload failed">
						The server rejected the file.
					</Alert>
					<Alert color="neutral">Read-only document.</Alert>
				</div>
			</Variant>

			<Variant name="Variants">
				<div className="c-vbox g-2">
					<Alert color="warning">Soft (default)</Alert>
					<Alert color="warning" variant="filled">
						Filled
					</Alert>
					<Alert color="warning" variant="outline">
						Outline
					</Alert>
				</div>
			</Variant>

			<Variant name="Actions and dismiss">
				{shown ? (
					<Alert
						color="error"
						title="Connection lost"
						actions={<Button size="sm">Retry</Button>}
						onDismiss={() => setShown(false)}
					>
						Changes are kept locally until the connection returns.
					</Alert>
				) : (
					<Button onClick={() => setShown(true)}>Show again</Button>
				)}
			</Variant>

			<Variant name="Compact neutral (offline banner)">
				<Alert color="neutral" compact icon={<LuWifiOff />}>
					You are offline.
				</Alert>
			</Variant>

			<Variant name="Inverse">
				<div className="p-3" style={{ background: '#222' }}>
					<Alert inverse compact>
						Processing video…
					</Alert>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
