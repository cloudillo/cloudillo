// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, EmptyState } from '@cloudillo/react'
import * as React from 'react'
import { LuFileQuestion, LuFolder, LuImage, LuInbox, LuSearch } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function EmptyStateStory() {
	return (
		<Story
			name="EmptyState"
			description="Empty state placeholder for when no content is available."
			props={[
				{ name: 'icon', type: 'ReactNode', descr: 'Icon to display at the top' },
				{ name: 'title', type: 'ReactNode', descr: 'Main heading text' },
				{ name: 'description', type: 'ReactNode', descr: 'Secondary description text' },
				{ name: 'actions', type: 'ReactNode', descr: 'Action buttons or elements' },
				{ name: 'action', type: 'ReactNode', descr: 'Deprecated alias of actions' },
				{ name: 'color', type: 'ColorVariant', descr: 'Tone of the icon' },
				{ name: 'size', type: '"sm" | "md" | "lg"', descr: 'Size variant (default: md)' },
				{ name: 'fill', type: 'boolean', descr: 'Fill and centre in the parent' },
				{ name: 'inverse', type: 'boolean', descr: 'Light-on-dark, for dark overlays' },
				{
					name: 'headingLevel',
					type: 'HeadingLevel',
					descr: 'Title heading level (default: 3)'
				}
			]}
		>
			<Variant name="Basic Empty State">
				<EmptyState
					icon={<LuFolder style={{ fontSize: '2.5rem' }} />}
					title="No files found"
					description="Upload some files to get started"
				/>
			</Variant>

			<Variant name="With Action Button">
				<EmptyState
					icon={<LuInbox style={{ fontSize: '2.5rem' }} />}
					title="Your inbox is empty"
					description="Messages you receive will appear here"
					actions={<Button color="primary">Check settings</Button>}
				/>
			</Variant>

			<Variant name="Search No Results">
				<EmptyState
					icon={<LuSearch style={{ fontSize: '2.5rem' }} />}
					title="No results found"
					description="Try adjusting your search terms or filters"
					actions={<Button color="secondary">Clear filters</Button>}
				/>
			</Variant>

			<Variant name="Size Variants">
				<div className="c-hbox g-4" style={{ flexWrap: 'wrap' }}>
					<div style={{ flex: 1, minWidth: 200 }}>
						<EmptyState
							size="sm"
							icon={<LuFileQuestion />}
							title="Small"
							description="Compact empty state"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 200 }}>
						<EmptyState
							size="md"
							icon={<LuFileQuestion style={{ fontSize: '2rem' }} />}
							title="Medium"
							description="Default empty state"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 200 }}>
						<EmptyState
							size="lg"
							icon={<LuFileQuestion style={{ fontSize: '3rem' }} />}
							title="Large"
							description="Prominent empty state"
						/>
					</div>
				</div>
			</Variant>

			<Variant name="Gallery Empty">
				<EmptyState
					icon={<LuImage style={{ fontSize: '2.5rem' }} />}
					title="No images yet"
					description="Upload photos to see them in your gallery"
					actions={<Button color="primary">Upload images</Button>}
				/>
			</Variant>

			<Variant name="Colors">
				<div className="c-hbox g-4" style={{ flexWrap: 'wrap' }}>
					<EmptyState color="error" icon={<LuFileQuestion />} title="Failed to load" />
					<EmptyState color="warning" icon={<LuInbox />} title="Quota almost full" />
					<EmptyState color="success" icon={<LuFolder />} title="All caught up" />
				</div>
			</Variant>

			<Variant name="Fill">
				<div style={{ height: 240, border: '1px dashed currentColor' }}>
					<EmptyState fill icon={<LuFolder />} title="Centred in the parent" />
				</div>
			</Variant>

			<Variant name="Inverse">
				<div className="p-3" style={{ background: '#222' }}>
					<EmptyState
						inverse
						icon={<LuImage />}
						title="No preview"
						description="On a dark overlay"
					/>
				</div>
			</Variant>

			<Variant name="Custom Content">
				<EmptyState
					icon={<LuFolder style={{ fontSize: '2.5rem' }} />}
					title="Welcome to your workspace"
				>
					<p style={{ textAlign: 'center', marginTop: '1rem' }}>
						Get started by creating your first project or importing existing files.
					</p>
					<div
						className="c-hbox g-2 justify-content-center"
						style={{ marginTop: '1rem' }}
					>
						<Button color="primary">Create project</Button>
						<Button color="secondary">Import files</Button>
					</div>
				</EmptyState>
			</Variant>
		</Story>
	)
}

// vim: ts=4
