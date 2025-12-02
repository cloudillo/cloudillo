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
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { TreeView, TreeItem, TreeItemDragData } from '@cloudillo/react'
import {
	PiRectangleBold as IcRect,
	PiCircleBold as IcEllipse,
	PiMinusBold as IcLine,
	PiTextTBold as IcText,
	PiImageBold as IcImage,
	PiFolderBold as IcFolder,
	PiFolderOpenBold as IcFolderOpen,
	PiFolderPlusBold as IcNewFolder,
	PiEyeBold as IcVisible,
	PiEyeSlashBold as IcHidden,
	PiLockBold as IcLocked,
	PiLockOpenBold as IcUnlocked
} from 'react-icons/pi'
import { LuShapes as IcDefault } from 'react-icons/lu'

import type { YPrelloDocument, ObjectId, ContainerId, ViewId, ChildRef } from '../../crdt'
import {
	expandObject,
	expandContainer,
	moveObject,
	reorderObject,
	moveContainer,
	reorderContainer,
	toggleObjectVisibility,
	toggleObjectLock,
	createContainer
} from '../../crdt'

// Extended drag data with parent info
interface DragData extends TreeItemDragData {
	parentId: ContainerId | undefined
}

// Drop target state
interface DropTarget {
	id: string
	type: 'object' | 'container'
	parentId: ContainerId | undefined
	position: 'before' | 'after' | 'inside'
}

export interface LayerBrowserProps {
	doc: YPrelloDocument
	yDoc: Y.Doc
	selectedIds: Set<ObjectId>
	onSelectObject: (id: ObjectId, addToSelection?: boolean) => void
	activeViewId: ViewId | null
	/** Currently selected container (layer) ID */
	selectedContainerId?: ContainerId | null
	/** Callback when a container is selected */
	onSelectContainer?: (id: ContainerId | null) => void
}

// Get icon for object type
function getObjectIcon(type: string) {
	switch (type) {
		case 'rect': return <IcRect size={14} />
		case 'ellipse': return <IcEllipse size={14} />
		case 'line': return <IcLine size={14} />
		case 'text':
		case 'textbox': return <IcText size={14} />
		case 'image': return <IcImage size={14} />
		default: return <IcDefault size={14} />
	}
}

// Get display name for object
function getObjectDisplayName(obj: { name?: string; type: string }): string {
	if (obj.name) return obj.name
	// Capitalize type name
	return obj.type.charAt(0).toUpperCase() + obj.type.slice(1)
}

export function LayerBrowser({
	doc,
	yDoc,
	selectedIds,
	onSelectObject,
	activeViewId,
	selectedContainerId,
	onSelectContainer
}: LayerBrowserProps) {
	// Subscribe to changes in objects and containers
	const objectsMap = useY(doc.o)
	const containersMap = useY(doc.c)
	const rootChildren = useY(doc.r)

	// Track expanded state locally
	const [expandedContainers, setExpandedContainers] = React.useState<Set<string>>(new Set())

	// Drag-drop state
	const [draggedItem, setDraggedItem] = React.useState<DragData | null>(null)
	const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null)

	// Object visibility and lock handlers (using proper CRDT functions)
	const handleToggleObjectVisibility = React.useCallback((e: React.MouseEvent, id: ObjectId) => {
		e.stopPropagation()
		toggleObjectVisibility(yDoc, doc, id)
	}, [doc, yDoc])

	const handleToggleObjectLock = React.useCallback((e: React.MouseEvent, id: ObjectId) => {
		e.stopPropagation()
		toggleObjectLock(yDoc, doc, id)
	}, [doc, yDoc])

	// Container visibility and lock handlers
	const handleToggleContainerVisibility = React.useCallback((e: React.MouseEvent, id: ContainerId) => {
		e.stopPropagation()
		const container = doc.c.get(id)
		if (!container) return
		const visible = container.v !== false
		yDoc.transact(() => {
			if (visible) {
				doc.c.set(id, { ...container, v: false })
			} else {
				const updated = { ...container }
				delete updated.v
				doc.c.set(id, updated)
			}
		})
	}, [doc, yDoc])

	const handleToggleContainerLock = React.useCallback((e: React.MouseEvent, id: ContainerId) => {
		e.stopPropagation()
		const container = doc.c.get(id)
		if (!container) return
		const locked = container.k === true
		yDoc.transact(() => {
			if (locked) {
				const updated = { ...container }
				delete updated.k
				doc.c.set(id, updated)
			} else {
				doc.c.set(id, { ...container, k: true })
			}
		})
	}, [doc, yDoc])

	// Toggle expanded state
	const toggleExpanded = React.useCallback((id: string) => {
		setExpandedContainers(prev => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}, [])

	// Create new layer (container)
	const handleCreateLayer = React.useCallback(() => {
		const containerId = createContainer(yDoc, doc, 'layer', {
			name: `Layer ${doc.r.length + 1}`
		})
		// Auto-expand the new layer
		setExpandedContainers(prev => new Set(prev).add(containerId))
	}, [yDoc, doc])

	// Drag-drop handlers
	const handleDragStart = React.useCallback((e: React.DragEvent, data: TreeItemDragData, parentId: ContainerId | undefined) => {
		setDraggedItem({ ...data, parentId })
	}, [])

	const handleDragOver = React.useCallback((
		e: React.DragEvent,
		targetId: string,
		targetType: 'object' | 'container',
		targetParentId: ContainerId | undefined,
		position: 'before' | 'after' | 'inside'
	) => {
		// Prevent dropping on self
		if (draggedItem && draggedItem.id === targetId) {
			setDropTarget(null)
			return
		}

		// Prevent dropping container inside itself (would create cycle)
		if (draggedItem?.type === 'container' && position === 'inside') {
			// Check if target is a descendant of dragged container
			// For now, just prevent dropping containers inside other containers for simplicity
			setDropTarget(null)
			return
		}

		setDropTarget({
			id: targetId,
			type: targetType,
			parentId: targetParentId,
			position
		})
	}, [draggedItem])

	const handleDragLeave = React.useCallback((e: React.DragEvent) => {
		// Only clear if leaving the tree entirely
		const relatedTarget = e.relatedTarget as Element | null
		if (!relatedTarget || !relatedTarget.closest?.('.c-tree-view')) {
			setDropTarget(null)
		}
	}, [])

	const handleDrop = React.useCallback((
		e: React.DragEvent,
		targetId: string,
		targetType: 'object' | 'container',
		targetParentId: ContainerId | undefined,
		position: 'before' | 'after' | 'inside'
	) => {
		if (!draggedItem || draggedItem.id === targetId) {
			setDraggedItem(null)
			setDropTarget(null)
			return
		}

		// Get the children array for calculating indices
		const getChildren = (parentId: ContainerId | undefined): Y.Array<ChildRef> => {
			if (parentId) {
				return doc.ch.get(parentId) || doc.r
			}
			return doc.r
		}

		// Calculate the target index based on drop position
		const calculateIndex = (
			targetParentId: ContainerId | undefined,
			targetId: string,
			position: 'before' | 'after' | 'inside'
		): number => {
			if (position === 'inside') {
				// Insert at the end of the container's children (top of z-order)
				const containerChildren = doc.ch.get(targetId as ContainerId)
				return containerChildren ? containerChildren.length : 0
			}

			const children = getChildren(targetParentId)
			let targetIndex = -1

			// Find the target item's index
			children.forEach((ref: [number, string], i: number) => {
				if (ref[1] === targetId) {
					targetIndex = i
				}
			})

			if (targetIndex < 0) return 0

			// Note: The layer browser shows items reversed (top of visual = end of array)
			// So 'before' in visual terms means higher array index, 'after' means lower
			return position === 'before' ? targetIndex + 1 : targetIndex
		}

		const sameParent = draggedItem.parentId === targetParentId
		const movingIntoContainer = position === 'inside'
		const newParent = movingIntoContainer ? targetId as ContainerId : targetParentId
		const targetIndex = calculateIndex(movingIntoContainer ? targetId as ContainerId : targetParentId, targetId, position)

		if (draggedItem.type === 'object') {
			if (sameParent && !movingIntoContainer) {
				// Reorder within same parent
				reorderObject(yDoc, doc, draggedItem.id as ObjectId, targetIndex)
			} else {
				// Move to different parent
				moveObject(yDoc, doc, draggedItem.id as ObjectId, newParent, targetIndex)
			}
		} else {
			// Container
			if (sameParent && !movingIntoContainer) {
				reorderContainer(yDoc, doc, draggedItem.id as ContainerId, targetIndex)
			} else {
				moveContainer(yDoc, doc, draggedItem.id as ContainerId, newParent, targetIndex)
			}
		}

		setDraggedItem(null)
		setDropTarget(null)
	}, [doc, yDoc, draggedItem])

	const handleDragEnd = React.useCallback((e: React.DragEvent) => {
		setDraggedItem(null)
		setDropTarget(null)
	}, [])

	// Build tree structure from root children
	const rootItems = React.useMemo(() => {
		const items: Array<{ type: 'object' | 'container'; id: string }> = []

		// rootChildren is Y.Array of [type, id] tuples
		// type: 0 = object, 1 = container
		rootChildren.forEach((ref: [number, string]) => {
			const [type, id] = ref
			if (type === 0) {
				items.push({ type: 'object', id })
			} else if (type === 1) {
				items.push({ type: 'container', id })
			}
		})

		// Reverse to show top items first (last in z-order = top)
		return items.reverse()
	}, [rootChildren])

	// Render a container and its children
	const renderContainer = (containerId: string, depth: number, parentId: ContainerId | undefined): React.ReactNode => {
		const stored = doc.c.get(containerId)
		if (!stored) return null

		const container = expandContainer(containerId, stored)
		const isExpanded = expandedContainers.has(containerId)
		const isVisible = container.visible
		const isLocked = container.locked
		const isDragging = draggedItem?.id === containerId
		const isDropTarget = dropTarget?.id === containerId
		const dropPos = isDropTarget ? dropTarget.position : null
		const isSelected = selectedContainerId === containerId

		// Get children from doc.ch
		const childrenArray = doc.ch?.get(containerId)
		const children: Array<{ type: 'object' | 'container'; id: string }> = []
		if (childrenArray) {
			childrenArray.forEach((ref: [number, string]) => {
				const [type, id] = ref
				children.push({ type: type === 0 ? 'object' : 'container', id })
			})
		}
		// Reverse children to show top items first
		children.reverse()

		return (
			<TreeItem
				key={containerId}
				id={containerId}
				depth={depth}
				hasChildren={children.length > 0}
				expanded={isExpanded}
				selected={isSelected}
				icon={isExpanded ? <IcFolderOpen size={14} /> : <IcFolder size={14} />}
				label={container.name || 'Layer'}
				dragging={isDragging}
				dropTarget={isDropTarget}
				dropPosition={dropPos}
				onToggle={() => toggleExpanded(containerId)}
				onSelect={() => {
					// Select this container (for creating objects inside)
					onSelectContainer?.(containerId as ContainerId)
					// Also expand it
					if (!isExpanded) {
						toggleExpanded(containerId)
					}
				}}
				isDraggable
				dragData={{ id: containerId, type: 'container', parentId } as DragData}
				onItemDragStart={(e, data) => handleDragStart(e, data, parentId)}
				onItemDragOver={(e, pos) => handleDragOver(e, containerId, 'container', parentId, pos)}
				onItemDragLeave={handleDragLeave}
				onItemDrop={(e, pos) => handleDrop(e, containerId, 'container', parentId, pos)}
				onItemDragEnd={handleDragEnd}
				actions={
					<>
						<button
							type="button"
							className="c-button icon"
							style={{ padding: '2px', minWidth: 'auto' }}
							onClick={e => handleToggleContainerVisibility(e, containerId as ContainerId)}
							title={isVisible ? 'Hide' : 'Show'}
						>
							{isVisible ? <IcVisible size={12} /> : <IcHidden size={12} />}
						</button>
						<button
							type="button"
							className="c-button icon"
							style={{ padding: '2px', minWidth: 'auto' }}
							onClick={e => handleToggleContainerLock(e, containerId as ContainerId)}
							title={isLocked ? 'Unlock' : 'Lock'}
						>
							{isLocked ? <IcLocked size={12} /> : <IcUnlocked size={12} />}
						</button>
					</>
				}
			>
				{isExpanded && children.map(child => {
					if (child.type === 'object') {
						return renderObject(child.id, depth + 1, containerId as ContainerId)
					} else {
						return renderContainer(child.id, depth + 1, containerId as ContainerId)
					}
				})}
			</TreeItem>
		)
	}

	// Render an object
	const renderObject = (objectId: string, depth: number, parentId: ContainerId | undefined): React.ReactNode => {
		const stored = doc.o.get(objectId)
		if (!stored) return null

		const obj = expandObject(objectId, stored)
		const isSelected = selectedIds.has(objectId as ObjectId)
		const isVisible = obj.visible
		const isLocked = obj.locked
		const isDragging = draggedItem?.id === objectId
		const isDropTarget = dropTarget?.id === objectId
		const dropPos = isDropTarget ? dropTarget.position : null

		return (
			<TreeItem
				key={objectId}
				id={objectId}
				depth={depth}
				selected={isSelected}
				icon={getObjectIcon(obj.type)}
				label={getObjectDisplayName(obj)}
				dragging={isDragging}
				dropTarget={isDropTarget}
				dropPosition={dropPos}
				onSelect={() => onSelectObject(objectId as ObjectId)}
				isDraggable
				dragData={{ id: objectId, type: 'object', parentId } as DragData}
				onItemDragStart={(e, data) => handleDragStart(e, data, parentId)}
				onItemDragOver={(e, pos) => handleDragOver(e, objectId, 'object', parentId, pos)}
				onItemDragLeave={handleDragLeave}
				onItemDrop={(e, pos) => handleDrop(e, objectId, 'object', parentId, pos)}
				onItemDragEnd={handleDragEnd}
				actions={
					<>
						<button
							type="button"
							className="c-button icon"
							style={{ padding: '2px', minWidth: 'auto' }}
							onClick={e => handleToggleObjectVisibility(e, objectId as ObjectId)}
							title={isVisible ? 'Hide' : 'Show'}
						>
							{isVisible ? <IcVisible size={12} /> : <IcHidden size={12} />}
						</button>
						<button
							type="button"
							className="c-button icon"
							style={{ padding: '2px', minWidth: 'auto' }}
							onClick={e => handleToggleObjectLock(e, objectId as ObjectId)}
							title={isLocked ? 'Unlock' : 'Lock'}
						>
							{isLocked ? <IcLocked size={12} /> : <IcUnlocked size={12} />}
						</button>
					</>
				}
			/>
		)
	}

	return (
		<div className="c-vbox g-1">
			<div className="c-hbox" style={{ justifyContent: 'flex-end', marginBottom: '4px' }}>
				<button
					type="button"
					className="c-button icon sm"
					onClick={handleCreateLayer}
					title="New Layer"
				>
					<IcNewFolder size={14} />
				</button>
			</div>
			<TreeView>
				{rootItems.map(item => {
					if (item.type === 'object') {
						return renderObject(item.id, 0, undefined)
					} else {
						return renderContainer(item.id, 0, undefined)
					}
				})}
				{rootItems.length === 0 && (
					<div style={{ fontSize: '11px', opacity: 0.5, padding: '8px 0' }}>
						No objects
					</div>
				)}
			</TreeView>
		</div>
	)
}

// vim: ts=4
