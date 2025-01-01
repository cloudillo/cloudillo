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

export function CloudilloLogo({ className, style }: { className?: string, style?: React.CSSProperties }) {
	const cls1 = { fill: '#e98a54', strokeWidth: 0 }
	const cls2 = { fill: '#fff', strokeWidth: 0 }
	const cls3 = { fill: '#007ba2', strokeWidth: 0 }
	return <svg viewBox="0 0 770 490" className={className + ' c-logo'} style={style}>
		<path style={cls2} d="m684.56 206.51c-11.5-4.1-23.3-6.3-34.7-8.3-1.1-0.2-2.2-0.4-3.4-0.6-3.9-47.7-30.2-88.1-72.1-109.6-40.8-20.9-89.3-19.4-130.1 3.2-0.7-1.3-1.3-2.6-2-3.8-33.9-63.3-108.9-97.5-178.4-81.5-72.3 16.7-124.5 78.6-127 150.4 0 1.3-0.1 2.3-0.2 2.9-0.7 0.2-1.8 0.3-3.2 0.5-49.5 5.6-92.6 35.4-115.5 79.6-22.8 44-22.2 96.2 1.6 139.5 28.2 51.4 75.1 78.7 135.5 78.7h166.5c20 15 40.7 20.5 63.4 20.5h2.8c20.6 0 47-7 60.6-20.4h187.1c5.7 0 11.5-0.3 17.9-1 58.8-6.2 106.8-52.3 114.2-109.8 7.9-63.3-25.4-119.8-83-140.3z"/>
		<path style={cls3} d="m438.26 112.61c82.6-59.3 193.7-5.2 193.7 97.3 16 3.5 32.4 5.3 47.6 10.7 51.1 18.2 80.1 68.6 73 124.4-6.4 50.2-49.2 91.3-100.8 96.8-5.4 0.6-10.9 0.9-16.4 0.9-160.1 0-320.2 0.1-480.4-0.1-54.3-0.1-96.2-23.2-122.4-71-45.6-83.2 8.1-186.3 102.5-197.1 12.7-1.4 16.3-5.2 16.7-17.8 2.2-65.8 49.6-121.1 115.4-136.3 63-14.6 131.1 16.5 161.8 73.9 3 5.7 5.8 11.5 9.3 18.3z"/>
		<path style={cls2} d="m693.66 310.31c-11.3-18.2-32.6-26.6-52.5-22.4-5.5 1.2-10.9 3.3-15.9 6.4-11.3 7-19.2 18-22.2 30.9-0.1 0.3-0.1 0.6-0.2 0.9-33 6.4-52.7 10.2-72.4 14-17.7 3.4-35.5 6.8-63.1 12.2-3.3-8.6-7.9-16.5-13.6-23.5 11.7-18.9 20-32.2 28.2-45.5 9.1-14.7 18.3-29.4 31.9-51.5 10.8 1 21.5-1.5 30.8-7.4 11.3-7.1 19.1-18.1 22.1-31.1 6.1-26.8-10.7-53.5-37.4-59.6-21-4.8-41.9 4.5-53 21.6-3.1 4.7-5.3 10.1-6.7 15.8-3 13-0.7 26.3 6.4 37.6 1.1 1.7 2.2 3.3 3.5 4.8-13.8 22.3-23 37-32.1 51.8-7.3 11.8-14.7 23.6-24.3 39.2-12.3-5.9-26.1-9.1-40.7-8.7-6.6 0.2-12.9 0.9-18.9 2.2-9.3-24.8-14.8-39.5-20.2-54.1-5.6-15-11.2-30.1-21-56.3 4.2-2.7 8.1-5.8 11.7-9.4 12.4-12.6 19.2-29.4 19-47.1s-7.2-34.3-19.9-46.7c-26.1-25.6-68.2-25.2-93.8 0.9-20.1 20.4-24.2 50.7-12.5 75.2 3.2 6.8 7.7 13.1 13.3 18.6 12.2 12 28.3 18.6 45.3 18.9 0.2 1.3 0.5 2.5 1 3.8 9.9 26.3 15.5 41.4 21.1 56.5 5.6 15 11.1 30 20.9 56-9.5 7.5-17.2 16.8-22.7 27.7-18.5-4.3-30.9-7.2-43.2-10.1-13.9-3.2-27.8-6.5-50.5-11.7 0.4-6.4 0.1-13-1.2-19.5-3.8-19.1-14.9-35.6-31.1-46.4s-35.7-14.6-54.8-10.8c-39.4 7.9-65.1 46.4-57.2 85.8 6.2 30.9 31.2 53.3 60.6 57.8 8.1 1.2 16.6 1.1 25.2-0.6 18.5-3.7 34.5-14.3 45.3-29.7 25.1 5.8 39.8 9.2 54.5 12.7 12.2 2.9 24.4 5.7 42.7 9.9-0.1 2.4-0.2 4.9-0.1 7.4 1.3 49 42 87.6 91 86.3 46.1-1.2 83.1-37.5 86.1-82.6 29.7-5.8 48.3-9.4 66.8-12.9 19.2-3.7 38.4-7.4 70-13.6 7 10.6 17.6 18 30 20.9 12.9 3 26.3 0.8 37.5-6.2 23.6-14.4 30.7-45.1 16.3-68.4z"/>
		<circle className="circle main" style={cls1} cx="384.86" cy="384.51" r="79.2"/>
		<path className="line" style={cls1} d="m601.66 335.91c-60.2 11.8-75.5 14.5-131.3 25.4 1.7 6.2 2.7 12.6 3 19.2 57-11.1 72.2-13.9 132-25.5-2.5-6.1-3.7-12.5-3.7-19.1z"/>
		<path className="line" style={cls1} d="m486.66 220.71c-23.8 38.4-33.7 54.2-55 88.6 5.6 3.5 10.7 7.5 15.3 12.1 22.5-36.3 32.3-51.9 56.8-91.5-6.3-1.9-12.1-5.1-17.1-9.2z"/>
		<path className="line" style={cls1} d="m301.86 351.01c-37.5-8.7-49.3-11.6-91.1-21.2-1.3 6.4-3.5 12.5-6.5 18.4 43.4 10 55.1 12.9 92.9 21.6 0.9-6.5 2.5-12.8 4.7-18.8z"/>
		<path className="line" style={cls1} d="m295.66 199.21c19.3 51.4 22.3 59.9 40.9 109.6 5.5-3.3 11.4-6 17.8-8.2-18.4-48.9-21.4-57.7-40.4-108.3-5.9 2.6-12.2 4.4-18.7 5.2 0.1 0.7 0.2 1.2 0.4 1.7z"/>
		<circle className="circle small" style={cls1} cx="518.36" cy="182.31" r="39.7"/>
		<circle className="circle small" style={cls1} cx="139.46" cy="315.01" r="63.1"/>
		<circle className="circle small" style={cls1} cx="286.76" cy="131.91" r="56.2"/>
		<circle className="circle small" style={cls1} cx="651.36" cy="336.51" r="39.7"/>
	</svg>
}

// vim: ts=4
