// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	CodeBlock,
	FAB,
	IcAdd,
	IcAlignCenter,
	IcAlignLeft,
	IcAlignRight,
	IcBold,
	IcDelete,
	IcDownload,
	IcExport,
	IcItalic,
	IcRedo,
	IcSearch,
	IcUnderline,
	IcUndo,
	Toolbar,
	ToolbarDivider,
	ToolbarGroup,
	ToolbarSpacer
} from '@cloudillo/react'
import * as React from 'react'

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
						<IcDownload /> Save
					</Button>
					<Button color="secondary">
						<IcExport /> Export
					</Button>
					<ToolbarDivider />
					<Button color="secondary">
						<IcDelete /> Delete
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
							<IcBold />
						</Button>
						<Button color="secondary" aria-label="Italic">
							<IcItalic />
						</Button>
						<Button color="secondary" aria-label="Underline">
							<IcUnderline />
						</Button>
					</ToolbarGroup>
					<ToolbarDivider />
					<ToolbarGroup>
						<Button color="secondary" aria-label="Align left">
							<IcAlignLeft />
						</Button>
						<Button color="secondary" aria-label="Align center">
							<IcAlignCenter />
						</Button>
						<Button color="secondary" aria-label="Align right">
							<IcAlignRight />
						</Button>
					</ToolbarGroup>
					<ToolbarSpacer />
					<ToolbarGroup>
						<Button color="secondary" aria-label="Undo">
							<IcUndo />
						</Button>
						<Button color="secondary" aria-label="Redo">
							<IcRedo />
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
						<IcAdd />
					</Button>
					<Button color="secondary" aria-label="Search">
						<IcSearch />
					</Button>
					<ToolbarDivider />
					<Button color="secondary" aria-label="Undo">
						<IcUndo />
					</Button>
					<Button color="secondary" aria-label="Redo">
						<IcRedo />
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
						<IcDownload /> Save
					</Button>
				</Toolbar>
			</Variant>

			<Variant name="Padding, soft and floating">
				<Toolbar padding={0}>
					<Button aria-label="Bold" icon={<IcBold />} />
					<Button aria-label="Italic" icon={<IcItalic />} />
				</Toolbar>
				<Toolbar variant="soft">
					<Button aria-label="Undo" icon={<IcUndo />} />
					<Button aria-label="Redo" icon={<IcRedo />} />
				</Toolbar>
				<Toolbar floating autoHide>
					<Button aria-label="Search" icon={<IcSearch />} />
					<Button aria-label="Delete" icon={<IcDelete />} />
				</Toolbar>
			</Variant>

			<Variant
				name="FAB"
				description='`<FAB icon aria-label size color>` — pinned via Affix by default; affix={false} renders it in flow. Successor of Button mode="float".'
			>
				<FAB affix={false} icon={<IcAdd />} aria-label="Create" />
				<FAB
					affix={false}
					size="sm"
					color="secondary"
					icon={<IcAdd />}
					aria-label="Create"
				/>
				<FAB affix={false} size="lg" color="accent" icon={<IcAdd />} aria-label="Create" />
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
