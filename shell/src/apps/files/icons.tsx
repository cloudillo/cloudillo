// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { IcFile, IcFolder, IcImage, IcPagillo, IcPdf, IcVideo } from '@cloudillo/react'
import * as React from 'react'

import {
	IcCalcillo,
	IcFormillo,
	IcIdeallo,
	IcNotillo,
	IcPrezillo,
	IcQuillo,
	IcScanillo,
	IcTaskillo
} from '../../icons.js'

export const fileIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
	'image/jpeg': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/png': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/webp': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/avif': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/gif': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/svg+xml': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'video/mp4': (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />,
	'application/pdf': (props) => <IcPdf {...props} style={{ color: 'lch(50 50 0)' }} />,
	'cloudillo/quillo': (props) => <IcQuillo {...props} style={{ color: 'lch(50 50 250)' }} />,
	'cloudillo/calcillo': (props) => <IcCalcillo {...props} style={{ color: 'lch(50 50 150)' }} />,
	'cloudillo/ideallo': (props) => <IcIdeallo {...props} style={{ color: 'lch(50 50 60)' }} />,
	'cloudillo/prezillo': (props) => <IcPrezillo {...props} style={{ color: 'lch(50 50 100)' }} />,
	'cloudillo/pagillo': (props) => <IcPagillo {...props} style={{ color: 'lch(50 50 330)' }} />,
	'cloudillo/formillo': (props) => <IcFormillo {...props} style={{ color: 'lch(50 50 300)' }} />,
	'cloudillo/taskillo': (props) => <IcTaskillo {...props} style={{ color: 'lch(50 50 180)' }} />,
	'cloudillo/notillo': (props) => <IcNotillo {...props} style={{ color: 'lch(50 50 30)' }} />,
	'cloudillo/scanillo': (props) => <IcScanillo {...props} style={{ color: 'lch(50 50 210)' }} />,
	'cloudillo/folder': (props) => <IcFolder {...props} style={{ color: 'lch(55 40 70)' }} />
}

export function getFileIcon(
	contentType: string,
	fileTp?: string
): React.ComponentType<React.SVGProps<SVGSVGElement>> {
	if (fileTp === 'FLDR') {
		return fileIcons['cloudillo/folder'] || IcFolder
	}
	// Own-property check: `contentType` comes off federated file metadata, and a plain
	// lookup walks `Object.prototype` — `'constructor'` would return `Object`, which
	// React then renders as a component and throws on.
	if (Object.hasOwn(fileIcons, contentType)) {
		return fileIcons[contentType]
	}
	// Fallback for any image/* or video/* type
	if (contentType.startsWith('image/')) {
		return (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />
	}
	if (contentType.startsWith('video/')) {
		return (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />
	}
	return IcFile
}

// vim: ts=4
