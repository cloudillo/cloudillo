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
import { Story, Variant } from './storybook.js'
import { EmptyState, Button } from '@cloudillo/react'
import { LuFolder, LuInbox, LuSearch, LuFileQuestion, LuImage } from 'react-icons/lu'

export function EmptyStateStory() {
	return <Story
		name="EmptyState"
		description="Empty state placeholder for when no content is available."
		props={[
			{ name: 'icon', type: 'ReactNode', descr: 'Icon to display at the top' },
			{ name: 'title', type: 'ReactNode', descr: 'Main heading text' },
			{ name: 'description', type: 'ReactNode', descr: 'Secondary description text' },
			{ name: 'action', type: 'ReactNode', descr: 'Action button or element' },
			{ name: 'size', type: '"sm" | "md" | "lg"', descr: 'Size variant (default: md)' }
		]}
	>
		<Variant name="Basic Empty State">
			<EmptyState
				icon={<LuFolder style={{ fontSize: '2.5rem' }}/>}
				title="No files found"
				description="Upload some files to get started"
			/>
		</Variant>

		<Variant name="With Action Button">
			<EmptyState
				icon={<LuInbox style={{ fontSize: '2.5rem' }}/>}
				title="Your inbox is empty"
				description="Messages you receive will appear here"
				action={<Button variant="primary">Check settings</Button>}
			/>
		</Variant>

		<Variant name="Search No Results">
			<EmptyState
				icon={<LuSearch style={{ fontSize: '2.5rem' }}/>}
				title="No results found"
				description="Try adjusting your search terms or filters"
				action={<Button variant="secondary">Clear filters</Button>}
			/>
		</Variant>

		<Variant name="Size Variants">
			<div className="c-hbox g-4" style={{ flexWrap: 'wrap' }}>
				<div style={{ flex: 1, minWidth: 200 }}>
					<EmptyState
						size="sm"
						icon={<LuFileQuestion/>}
						title="Small"
						description="Compact empty state"
					/>
				</div>
				<div style={{ flex: 1, minWidth: 200 }}>
					<EmptyState
						size="md"
						icon={<LuFileQuestion style={{ fontSize: '2rem' }}/>}
						title="Medium"
						description="Default empty state"
					/>
				</div>
				<div style={{ flex: 1, minWidth: 200 }}>
					<EmptyState
						size="lg"
						icon={<LuFileQuestion style={{ fontSize: '3rem' }}/>}
						title="Large"
						description="Prominent empty state"
					/>
				</div>
			</div>
		</Variant>

		<Variant name="Gallery Empty">
			<EmptyState
				icon={<LuImage style={{ fontSize: '2.5rem' }}/>}
				title="No images yet"
				description="Upload photos to see them in your gallery"
				action={<Button variant="primary">Upload images</Button>}
			/>
		</Variant>

		<Variant name="Custom Content">
			<EmptyState
				icon={<LuFolder style={{ fontSize: '2.5rem' }}/>}
				title="Welcome to your workspace"
			>
				<p style={{ textAlign: 'center', marginTop: '1rem' }}>
					Get started by creating your first project or importing existing files.
				</p>
				<div className="c-hbox g-2 justify-content-center" style={{ marginTop: '1rem' }}>
					<Button variant="primary">Create project</Button>
					<Button variant="secondary">Import files</Button>
				</div>
			</EmptyState>
		</Variant>
	</Story>
}

// vim: ts=4
