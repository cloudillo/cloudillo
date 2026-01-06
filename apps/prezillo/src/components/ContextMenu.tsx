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
 * Context menu component for object actions (Duplicate, Delete, Hide/Show, Detach)
 */

import * as React from 'react'
import * as Y from 'yjs'
import {
	PiCopyBold as IcDuplicate,
	PiTrashBold as IcDelete,
	PiLinkBreakBold as IcDetach,
	PiEyeBold as IcShow,
	PiEyeSlashBold as IcHide
} from 'react-icons/pi'

import type { ObjectId, YPrezilloDocument } from '../crdt'
import { getObject, isInstance, toggleObjectHidden, detachInstance } from '../crdt'

export interface ContextMenuProps {
	position: { x: number; y: number }
	onClose: () => void
	onDuplicate: () => void
	onDelete: () => void
	selectedIds: Set<ObjectId>
	doc: YPrezilloDocument
	yDoc: Y.Doc
	menuRef?: React.RefObject<HTMLDivElement | null>
}

export function ContextMenu({
	position,
	onClose,
	onDuplicate,
	onDelete,
	selectedIds,
	doc,
	yDoc,
	menuRef
}: ContextMenuProps) {
	// Get the first selected object for single-object operations
	const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
	const singleSelectedObj = singleSelectedId ? getObject(doc, singleSelectedId) : null
	const isHidden = singleSelectedObj?.hidden ?? false
	const isSingleInstance = singleSelectedId && isInstance(doc, singleSelectedId)

	return (
		<div
			ref={menuRef}
			className="c-context-menu"
			style={{
				position: 'fixed',
				left: position.x,
				top: position.y,
				zIndex: 1000
			}}
		>
			<button
				className="c-context-menu__item"
				onClick={() => {
					onDuplicate()
					onClose()
				}}
			>
				<IcDuplicate /> Duplicate
			</button>

			{/* Hide/Show toggle - only for single selection */}
			{singleSelectedId && (
				<button
					className="c-context-menu__item"
					onClick={() => {
						toggleObjectHidden(yDoc, doc, singleSelectedId)
						onClose()
					}}
				>
					{isHidden ? (
						<>
							<IcShow /> Show
						</>
					) : (
						<>
							<IcHide /> Hide
						</>
					)}
				</button>
			)}

			{/* Detach from template - only for instances */}
			{isSingleInstance && (
				<button
					className="c-context-menu__item"
					onClick={() => {
						detachInstance(yDoc, doc, singleSelectedId!)
						onClose()
					}}
				>
					<IcDetach /> Detach from template
				</button>
			)}

			<button
				className="c-context-menu__item danger"
				onClick={() => {
					onDelete()
					onClose()
				}}
			>
				<IcDelete /> Delete
			</button>
		</div>
	)
}

// vim: ts=4
