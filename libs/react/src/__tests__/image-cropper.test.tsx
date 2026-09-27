// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { ImageCropper } from '../components/ImageCropper/index.js'

describe('ImageCropper', () => {
	it('applies the preset on load and does not reset on mount', () => {
		const onCropChange = jest.fn()
		const { container } = render(
			<ImageCropper src="data:," aspects={['1:1']} onCropChange={onCropChange} />
		)
		expect(onCropChange).not.toHaveBeenCalled()

		const img = container.querySelector('img') as HTMLImageElement
		Object.defineProperty(img, 'width', { value: 200 })
		Object.defineProperty(img, 'height', { value: 100 })
		fireEvent.load(img)

		expect(onCropChange).toHaveBeenLastCalledWith({ x: 50, y: 0, width: 100, height: 100 })
	})
})

// vim: ts=4
