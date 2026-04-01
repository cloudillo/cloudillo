// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Path Processing index
 *
 * Re-exports smoothing and interpolation functions.
 */

export { chaikinSmooth, adaptiveSmooth } from './smooth.js'
export {
	resamplePath,
	interpolatePaths,
	easeOut,
	easeInOut
} from './interpolate.js'

// vim: ts=4
