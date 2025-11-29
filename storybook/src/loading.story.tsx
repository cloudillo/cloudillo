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
import { LoadingSpinner, Skeleton, SkeletonText, SkeletonCard, SkeletonList } from '@cloudillo/react'

export function LoadingSpinnerStory() {
	return <Story
		name="LoadingSpinner"
		description="Animated loading spinner for indicating loading states."
		props={[
			{ name: 'size', type: '"sm" | "md" | "lg"', descr: 'Size of the spinner' },
			{ name: 'variant', type: '"primary" | "secondary" | "accent" | "error" | "warning" | "success"', descr: 'Color variant' },
			{ name: 'label', type: 'string', descr: 'Optional loading text to display' }
		]}
	>
		<Variant name="Sizes">
			<div className="c-hbox g-4 align-items-center">
				<LoadingSpinner size="sm"/>
				<LoadingSpinner size="md"/>
				<LoadingSpinner size="lg"/>
			</div>
		</Variant>

		<Variant name="Color Variants">
			<div className="c-hbox g-4 align-items-center">
				<LoadingSpinner variant="primary"/>
				<LoadingSpinner variant="secondary"/>
				<LoadingSpinner variant="accent"/>
				<LoadingSpinner variant="success"/>
				<LoadingSpinner variant="warning"/>
				<LoadingSpinner variant="error"/>
			</div>
		</Variant>

		<Variant name="With Label">
			<div className="c-vbox g-4">
				<LoadingSpinner size="sm" label="Loading..."/>
				<LoadingSpinner size="md" label="Please wait"/>
				<LoadingSpinner size="lg" label="Fetching data"/>
			</div>
		</Variant>
	</Story>
}

export function SkeletonStory() {
	return <Story
		name="Skeleton"
		description="Placeholder loading component that mimics content shapes while loading."
		props={[
			{ name: 'variant', type: '"text" | "circle" | "rect" | "rounded"', descr: 'Shape variant' },
			{ name: 'width', type: 'string | number', descr: 'Width of the skeleton' },
			{ name: 'height', type: 'string | number', descr: 'Height of the skeleton' },
			{ name: 'animate', type: 'boolean', descr: 'Enable shimmer animation (default: true)' }
		]}
	>
		<Variant name="Basic Shapes">
			<div className="c-vbox g-3">
				<Skeleton variant="text" width="100%"/>
				<Skeleton variant="rect" width={200} height={100}/>
				<Skeleton variant="rounded" width={200} height={100}/>
				<Skeleton variant="circle" width={48} height={48}/>
			</div>
		</Variant>

		<Variant name="No Animation">
			<div className="c-hbox g-3">
				<Skeleton variant="rect" width={100} height={100} animate={false}/>
				<Skeleton variant="circle" width={48} height={48} animate={false}/>
			</div>
		</Variant>
	</Story>
}

export function SkeletonTextStory() {
	return <Story
		name="SkeletonText"
		description="Multiple skeleton lines for text content placeholder."
		props={[
			{ name: 'lines', type: 'number', descr: 'Number of text lines (default: 3)' },
			{ name: 'lastLineWidth', type: 'string', descr: 'Width of the last line (default: 60%)' }
		]}
	>
		<Variant name="Default (3 lines)">
			<SkeletonText/>
		</Variant>

		<Variant name="Custom Lines">
			<div className="c-vbox g-4">
				<div>
					<p className="mb-2">1 line:</p>
					<SkeletonText lines={1}/>
				</div>
				<div>
					<p className="mb-2">5 lines:</p>
					<SkeletonText lines={5}/>
				</div>
			</div>
		</Variant>

		<Variant name="Custom Last Line Width">
			<SkeletonText lines={4} lastLineWidth="40%"/>
		</Variant>
	</Story>
}

export function SkeletonCardStory() {
	return <Story
		name="SkeletonCard"
		description="Complete card skeleton with optional avatar and configurable text lines."
		props={[
			{ name: 'showAvatar', type: 'boolean', descr: 'Show avatar circle (default: true)' },
			{ name: 'lines', type: 'number', descr: 'Number of text lines (default: 3)' }
		]}
	>
		<Variant name="Default Card">
			<div style={{ maxWidth: 400 }}>
				<SkeletonCard/>
			</div>
		</Variant>

		<Variant name="Without Avatar">
			<div style={{ maxWidth: 400 }}>
				<SkeletonCard showAvatar={false}/>
			</div>
		</Variant>

		<Variant name="Varying Lines">
			<div className="c-hbox g-3" style={{ flexWrap: 'wrap' }}>
				<div style={{ width: 300 }}>
					<SkeletonCard lines={1}/>
				</div>
				<div style={{ width: 300 }}>
					<SkeletonCard lines={2}/>
				</div>
				<div style={{ width: 300 }}>
					<SkeletonCard lines={5}/>
				</div>
			</div>
		</Variant>
	</Story>
}

export function SkeletonListStory() {
	return <Story
		name="SkeletonList"
		description="Multiple skeleton cards for list loading states."
		props={[
			{ name: 'count', type: 'number', descr: 'Number of skeleton items (default: 3)' },
			{ name: 'showAvatar', type: 'boolean', descr: 'Show avatar in each item (default: true)' }
		]}
	>
		<Variant name="Default List">
			<div style={{ maxWidth: 500 }}>
				<SkeletonList/>
			</div>
		</Variant>

		<Variant name="Custom Count">
			<div style={{ maxWidth: 500 }}>
				<SkeletonList count={5}/>
			</div>
		</Variant>

		<Variant name="Without Avatars">
			<div style={{ maxWidth: 500 }}>
				<SkeletonList count={3} showAvatar={false}/>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
