// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { Toolbar, ToolbarDivider, ToolbarSpacer, ToolbarGroup, Button } from '@cloudillo/react'
import {
	LuBold,
	LuItalic,
	LuUnderline,
	LuAlignLeft,
	LuAlignCenter,
	LuAlignRight,
	LuUndo,
	LuRedo,
	LuSave,
	LuDownload,
	LuTrash2,
	LuPlus,
	LuSearch
} from 'react-icons/lu'

export function ToolbarStory() {
	return (
		<Story
			name="Toolbar"
			description="Horizontal toolbar for grouping actions. Use Toolbar.Group to cluster related actions, ToolbarDivider to separate groups, and ToolbarSpacer to push trailing items to the right."
			props={[
				{
					name: 'compact',
					type: 'boolean',
					descr: 'Use smaller padding for dense interfaces (canvas apps, editors)'
				},
				{ name: 'className', type: 'string', descr: 'Additional classes' }
			]}
		>
			<Variant name="Basic Toolbar">
				<Toolbar>
					<Button variant="secondary">
						<LuSave /> Save
					</Button>
					<Button variant="secondary">
						<LuDownload /> Export
					</Button>
					<ToolbarDivider />
					<Button variant="secondary">
						<LuTrash2 /> Delete
					</Button>
				</Toolbar>
			</Variant>

			<Variant
				name="Rich Text Editor"
				description="Groups + dividers for a typical editor toolbar."
			>
				<Toolbar>
					<ToolbarGroup>
						<Button variant="secondary" aria-label="Bold">
							<LuBold />
						</Button>
						<Button variant="secondary" aria-label="Italic">
							<LuItalic />
						</Button>
						<Button variant="secondary" aria-label="Underline">
							<LuUnderline />
						</Button>
					</ToolbarGroup>
					<ToolbarDivider />
					<ToolbarGroup>
						<Button variant="secondary" aria-label="Align left">
							<LuAlignLeft />
						</Button>
						<Button variant="secondary" aria-label="Align center">
							<LuAlignCenter />
						</Button>
						<Button variant="secondary" aria-label="Align right">
							<LuAlignRight />
						</Button>
					</ToolbarGroup>
					<ToolbarSpacer />
					<ToolbarGroup>
						<Button variant="secondary" aria-label="Undo">
							<LuUndo />
						</Button>
						<Button variant="secondary" aria-label="Redo">
							<LuRedo />
						</Button>
					</ToolbarGroup>
				</Toolbar>
			</Variant>

			<Variant
				name="Compact (canvas apps)"
				description="compact={true} — for dense tool palettes in prezillo, ideallo."
			>
				<Toolbar compact>
					<Button variant="secondary" aria-label="Add">
						<LuPlus />
					</Button>
					<Button variant="secondary" aria-label="Search">
						<LuSearch />
					</Button>
					<ToolbarDivider />
					<Button variant="secondary" aria-label="Undo">
						<LuUndo />
					</Button>
					<Button variant="secondary" aria-label="Redo">
						<LuRedo />
					</Button>
				</Toolbar>
			</Variant>

			<Variant
				name="With leading title + trailing actions"
				description="Common app-header pattern: title on the left, actions pushed right via ToolbarSpacer."
			>
				<Toolbar>
					<strong style={{ padding: '0 0.5rem' }}>My Document</strong>
					<ToolbarSpacer />
					<Button variant="primary">
						<LuSave /> Save
					</Button>
				</Toolbar>
			</Variant>
		</Story>
	)
}

// vim: ts=4
