// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The sticky card's drop shadow, defined once for the whole board.
 *
 * A filter reference that resolves to nothing makes the element not render at all, so this MUST be
 * mounted inside the same <svg> as every sticky note - it lives at the top of Canvas' SvgCanvas
 * children for that reason.
 */

import * as React from 'react'

import { STICKY_SHADOW_FILTER_ID } from '../utils/object-text.js'

export function StickyShadowDefs() {
	return (
		<defs>
			{/*
				Region is generous: dy 6 + a 5px blur reaches ~21px past the card, and the default
				-10% filter region would clip it on a small note.
			*/}
			<filter id={STICKY_SHADOW_FILTER_ID} x="-25%" y="-25%" width="150%" height="160%">
				<feDropShadow
					dx={3}
					dy={6}
					stdDeviation={5}
					floodColor="#000"
					floodOpacity={0.22}
				/>
			</filter>
		</defs>
	)
}

// vim: ts=4
