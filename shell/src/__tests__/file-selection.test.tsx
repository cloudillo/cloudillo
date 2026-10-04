// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A metadata edit must not clear the file selection.
 *
 * `useFileList.refresh()` resets `useInfiniteScroll`, which blanks the list for a tick
 * before the refetch lands. The old effect cleared the selection on any id-list change,
 * so that empty tick alone emptied the details panel. Now only ids that actually left
 * the list are dropped.
 */

import { renderHook } from '@testing-library/react'
import { act } from 'react'

import { useMultiSelect } from '../apps/files/hooks/useMultiSelect.js'
import type { File } from '../apps/files/types.js'

function file(fileId: string): File {
	return {
		entryId: fileId,
		fileId,
		fileName: `${fileId}.txt`,
		contentType: 'text/plain',
		createdAt: '2026-01-01T00:00:00Z',
		preset: ''
	}
}

const files = [file('f1'), file('f2'), file('f3')]
const click = { ctrlKey: false, metaKey: false, shiftKey: false } as React.MouseEvent

test('selection survives the empty tick of a refresh()', () => {
	const { result, rerender } = renderHook((props) => useMultiSelect(props), {
		initialProps: { files }
	})

	act(() => result.current.handleClick(files[1], click))
	expect(result.current.getFirstSelected()?.fileId).toBe('f2')

	rerender({ files: [] })
	rerender({ files })
	expect(result.current.getFirstSelected()?.fileId).toBe('f2')
})

test('navigating to another folder leaves nothing selected', () => {
	const { result, rerender } = renderHook((props) => useMultiSelect(props), {
		initialProps: { files }
	})

	act(() => result.current.handleClick(files[1], click))
	rerender({ files: [file('g1'), file('g2')] })
	expect(result.current.selectedIds.size).toBe(0)
	expect(result.current.anchorId).toBeUndefined()
})

test('a removed file drops out of the selection, the rest stays', () => {
	const { result, rerender } = renderHook((props) => useMultiSelect(props), {
		initialProps: { files }
	})

	act(() => result.current.handleClick(files[0], click))
	act(() => result.current.handleClick(files[1], { ...click, ctrlKey: true } as React.MouseEvent))
	expect(result.current.selectedIds.size).toBe(2)

	rerender({ files: [files[0], files[2]] })
	expect([...result.current.selectedIds]).toEqual(['f1'])
	expect(result.current.anchorId).toBeUndefined()
})

test('navigating into an EMPTY folder leaves nothing selected', () => {
	// Id-pruning cannot do this one: it deliberately keeps everything while the list is
	// empty, so only the navigation identity says the selection is no longer about
	// anything on screen.
	const { result, rerender } = renderHook((props) => useMultiSelect(props), {
		initialProps: { files, resetKey: 'browse:folder-a:' }
	})

	act(() => result.current.handleClick(files[1], click))
	expect(result.current.selectedIds.size).toBe(1)

	rerender({ files: [], resetKey: 'browse:folder-b:' })
	expect(result.current.selectedIds.size).toBe(0)
	expect(result.current.anchorId).toBeUndefined()
})

test('the empty tick of a refresh() keeps the selection while the list identity holds', () => {
	const { result, rerender } = renderHook((props) => useMultiSelect(props), {
		initialProps: { files, resetKey: 'browse:folder-a:' }
	})

	act(() => result.current.handleClick(files[1], click))

	rerender({ files: [], resetKey: 'browse:folder-a:' })
	expect([...result.current.selectedIds]).toEqual(['f2'])
})

// vim: ts=4
