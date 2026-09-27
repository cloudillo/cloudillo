// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	CodeBlock,
	FAB,
	Toolbar,
	ToolbarDivider,
	ToolbarGroup,
	ToolbarSpacer
} from '@cloudillo/react'
import * as React from 'react'
import {
	LuAlignCenter,
	LuAlignLeft,
	LuAlignRight,
	LuBold,
	LuDownload,
	LuItalic,
	LuPlus,
	LuRedo,
	LuSave,
	LuSearch,
	LuTrash2,
	LuUnderline,
	LuUndo
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

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
					<Button color="secondary">
						<LuSave /> Save
					</Button>
					<Button color="secondary">
						<LuDownload /> Export
					</Button>
					<ToolbarDivider />
					<Button color="secondary">
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
						<Button color="secondary" aria-label="Bold">
							<LuBold />
						</Button>
						<Button color="secondary" aria-label="Italic">
							<LuItalic />
						</Button>
						<Button color="secondary" aria-label="Underline">
							<LuUnderline />
						</Button>
					</ToolbarGroup>
					<ToolbarDivider />
					<ToolbarGroup>
						<Button color="secondary" aria-label="Align left">
							<LuAlignLeft />
						</Button>
						<Button color="secondary" aria-label="Align center">
							<LuAlignCenter />
						</Button>
						<Button color="secondary" aria-label="Align right">
							<LuAlignRight />
						</Button>
					</ToolbarGroup>
					<ToolbarSpacer />
					<ToolbarGroup>
						<Button color="secondary" aria-label="Undo">
							<LuUndo />
						</Button>
						<Button color="secondary" aria-label="Redo">
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
					<Button color="secondary" aria-label="Add">
						<LuPlus />
					</Button>
					<Button color="secondary" aria-label="Search">
						<LuSearch />
					</Button>
					<ToolbarDivider />
					<Button color="secondary" aria-label="Undo">
						<LuUndo />
					</Button>
					<Button color="secondary" aria-label="Redo">
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
					<Button color="primary">
						<LuSave /> Save
					</Button>
				</Toolbar>
			</Variant>

			<Variant name="Padding, soft and floating">
				<Toolbar padding={0}>
					<Button aria-label="Bold" icon={<LuBold />} />
					<Button aria-label="Italic" icon={<LuItalic />} />
				</Toolbar>
				<Toolbar variant="soft">
					<Button aria-label="Undo" icon={<LuUndo />} />
					<Button aria-label="Redo" icon={<LuRedo />} />
				</Toolbar>
				<Toolbar floating autoHide>
					<Button aria-label="Search" icon={<LuSearch />} />
					<Button aria-label="Delete" icon={<LuTrash2 />} />
				</Toolbar>
			</Variant>

			<Variant
				name="FAB"
				description='`<FAB icon aria-label size color>` — pinned via Affix by default; affix={false} renders it in flow. Successor of Button mode="float".'
			>
				<FAB affix={false} icon={<LuPlus />} aria-label="Create" />
				<FAB
					affix={false}
					size="sm"
					color="secondary"
					icon={<LuPlus />}
					aria-label="Create"
				/>
				<FAB affix={false} size="lg" color="accent" icon={<LuPlus />} aria-label="Create" />
			</Variant>

			<Variant
				name="CodeBlock"
				description="`inline` renders `<code>`; `copyable` adds a copy button."
			>
				<p>
					Run <CodeBlock inline>pnpm install</CodeBlock> first.
				</p>
				<CodeBlock copyable>{'pnpm -r build\npnpm -C shell dev'}</CodeBlock>
			</Variant>
		</Story>
	)
}

// vim: ts=4
