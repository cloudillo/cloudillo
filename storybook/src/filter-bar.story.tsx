// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { FilterBar } from '@cloudillo/react'
import { LuFolder, LuFile, LuStar, LuTrash2, LuSearch } from 'react-icons/lu'

export function FilterBarStory() {
	const [activeItem, setActiveItem] = React.useState<string>('all')

	return (
		<Story
			name="FilterBar"
			description="Navigation sidebar component for filtering content with icons, badges, and sections."
			props={[
				{
					name: 'variant',
					type: '"vertical" | "horizontal"',
					descr: 'Layout direction (default: vertical)'
				},
				{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Shadow/depth level' }
			]}
		>
			<Variant name="Basic Filter Bar">
				<div style={{ width: 220 }}>
					<FilterBar>
						<FilterBar.Item
							icon={<LuFolder />}
							label="All Files"
							active={activeItem === 'all'}
							onClick={() => setActiveItem('all')}
						/>
						<FilterBar.Item
							icon={<LuStar />}
							label="Favorites"
							active={activeItem === 'favorites'}
							onClick={() => setActiveItem('favorites')}
						/>
						<FilterBar.Item
							icon={<LuTrash2 />}
							label="Trash"
							active={activeItem === 'trash'}
							onClick={() => setActiveItem('trash')}
						/>
					</FilterBar>
				</div>
			</Variant>

			<Variant name="With Badges">
				<div style={{ width: 220 }}>
					<FilterBar>
						<FilterBar.Item
							icon={<LuFile />}
							label="Documents"
							badge={12}
							badgeVariant="primary"
						/>
						<FilterBar.Item
							icon={<LuFolder />}
							label="Shared"
							badge={3}
							badgeVariant="success"
						/>
						<FilterBar.Item
							icon={<LuTrash2 />}
							label="Trash"
							badge="!"
							badgeVariant="error"
						/>
					</FilterBar>
				</div>
			</Variant>

			<Variant name="With Sections">
				<div style={{ width: 220 }}>
					<FilterBar>
						<FilterBar.Section title="Browse">
							<FilterBar.Item icon={<LuFolder />} label="All Files" />
							<FilterBar.Item icon={<LuStar />} label="Starred" />
						</FilterBar.Section>
						<FilterBar.Divider />
						<FilterBar.Section title="Categories">
							<FilterBar.Item icon={<LuFile />} label="Documents" />
							<FilterBar.Item icon={<LuFile />} label="Images" />
							<FilterBar.Item icon={<LuFile />} label="Videos" />
						</FilterBar.Section>
					</FilterBar>
				</div>
			</Variant>

			<Variant name="With Search">
				<div style={{ width: 250 }}>
					<FilterBar>
						<FilterBar.Search
							placeholder="Search files..."
							searchIcon={<LuSearch />}
							onSearch={(q) => console.log('Search:', q)}
						/>
						<FilterBar.Divider />
						<FilterBar.Item icon={<LuFolder />} label="All Files" active />
						<FilterBar.Item icon={<LuStar />} label="Starred" />
					</FilterBar>
				</div>
			</Variant>

			<Variant name="Horizontal Layout">
				<FilterBar variant="horizontal">
					<FilterBar.Item label="All" active />
					<FilterBar.Item label="Active" />
					<FilterBar.Item label="Archived" />
					<FilterBar.Item label="Deleted" />
				</FilterBar>
			</Variant>

			<Variant name="With Router Links">
				<div style={{ width: 220 }}>
					<FilterBar>
						<FilterBar.Item icon={<LuFolder />} label="Home" to="/" />
						<FilterBar.Item icon={<LuFile />} label="Documents" to="/documents" />
						<FilterBar.Item
							icon={<LuStar />}
							label="External"
							href="https://example.com"
						/>
					</FilterBar>
				</div>
			</Variant>

			<Variant name="Disabled Items">
				<div style={{ width: 220 }}>
					<FilterBar>
						<FilterBar.Item icon={<LuFolder />} label="Available" />
						<FilterBar.Item icon={<LuFile />} label="Disabled" disabled />
						<FilterBar.Item icon={<LuStar />} label="Also Disabled" disabled />
					</FilterBar>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
