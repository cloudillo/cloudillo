// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Path Processing index
 *
 * Re-exports smoothing and interpolation functions.
 */

export {
	easeInOut,
	easeOut,
	interpolatePaths,
	resamplePath
} from './interpolate.js'
export { adaptiveSmooth, chaikinSmooth } from './smooth.js'

// vim: ts=4
