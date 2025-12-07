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

/**
 * ViewPicker component - Navigation bar for views/slides
 */

import * as React from 'react'
import { mergeClasses } from '../utils'

import {
	PiPlusBold as IcAdd,
	PiCaretLeftBold as IcPrev,
	PiCaretRightBold as IcNext,
	PiPlayBold as IcPlay
} from 'react-icons/pi'

import type { ViewId, ViewNode } from '../crdt'

export interface ViewPickerProps {
	views: ViewNode[]
	activeViewId: ViewId | null
	onViewSelect: (id: ViewId) => void
	onAddView: () => void
	onPrevView: () => void
	onNextView: () => void
	onPresent: () => void
	readOnly?: boolean
}

export function ViewPicker({
	views,
	activeViewId,
	onViewSelect,
	onAddView,
	onPrevView,
	onNextView,
	onPresent,
	readOnly
}: ViewPickerProps) {
	const activeIndex = views.findIndex((v) => v.id === activeViewId)

	return (
		<div className="c-nav c-hbox p-1 gap-1">
			<button
				onClick={onPrevView}
				className="c-button icon"
				disabled={activeIndex <= 0}
				title="Previous page"
			>
				<IcPrev />
			</button>

			<div className="c-hbox gap-1 flex-fill c-view-picker-tabs">
				{views.map((view, index) => (
					<button
						key={view.id}
						onClick={() => onViewSelect(view.id)}
						className={mergeClasses(
							'c-button c-view-picker-tab',
							view.id === activeViewId ? 'active' : ''
						)}
					>
						{index + 1}
					</button>
				))}
			</div>

			<button
				onClick={onNextView}
				className="c-button icon"
				disabled={activeIndex >= views.length - 1}
				title="Next page"
			>
				<IcNext />
			</button>

			{!readOnly && (
				<button onClick={onAddView} className="c-button icon" title="Add page">
					<IcAdd />
				</button>
			)}

			<button
				onClick={onPresent}
				className="c-button icon ms-2"
				title="Present (fullscreen)"
				disabled={views.length === 0}
			>
				<IcPlay />
			</button>
		</div>
	)
}

// vim: ts=4
