// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** One rendered `role="treeitem"`, in visible (DOM) order */
export interface TreeKeyItem {
	level: number
	expanded: boolean
	hasChildren: boolean
}

export type TreeKeyAction = { focus: number } | { toggle: true } | { select: true } | null

/**
 * What a key does on `items[index]`. `draggable` (the tree has `onMove`) leaves Space to
 * dnd-kit, which picks the item up.
 */
export function treeKeyAction(
	key: string,
	items: TreeKeyItem[],
	index: number,
	opts: { draggable: boolean }
): TreeKeyAction {
	const item = items[index]
	if (!item) return null
	switch (key) {
		case 'ArrowDown':
			return index < items.length - 1 ? { focus: index + 1 } : null
		case 'ArrowUp':
			return index > 0 ? { focus: index - 1 } : null
		case 'Home':
			return { focus: 0 }
		case 'End':
			return { focus: items.length - 1 }
		case 'ArrowRight':
			if (item.hasChildren && !item.expanded) return { toggle: true }
			// Not gated on `hasChildren`: a row can show an item under a toggle-less parent
			return (items[index + 1]?.level ?? 0) > item.level ? { focus: index + 1 } : null
		case 'ArrowLeft':
			if (item.hasChildren && item.expanded) return { toggle: true }
			for (let i = index - 1; i >= 0; i--) {
				if ((items[i]?.level ?? item.level) < item.level) return { focus: i }
			}
			return null
		case 'Enter':
			return { select: true }
		case ' ':
			return opts.draggable ? null : { select: true }
		default:
			return null
	}
}

// vim: ts=4
