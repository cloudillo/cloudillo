// Minimal OpenCV.js and jscanify type declarations for scanillo
// Covers only the API surface used in detect-document.ts and image-processing.ts

interface CvDeletable {
	delete(): void
}

interface CvMat extends CvDeletable {
	data: Uint8Array
	data32S: Int32Array
	rows: number
	cols: number
	type(): number
	clone(): CvMat
	convertTo(dst: CvMat, type: number): void
	setTo(scalar: CvScalar): void
}

interface CvMatVector extends CvDeletable {
	push_back(mat: CvMat): void
	get(i: number): CvMat
	size(): number
}

type CvScalar = Record<string, never>

type CvSize = Record<string, never>

interface CvRotatedRect {
	center: { x: number; y: number }
	size: { width: number; height: number }
	angle: number
}

interface CornerPoints {
	topLeftCorner: { x: number; y: number }
	topRightCorner: { x: number; y: number }
	bottomLeftCorner: { x: number; y: number }
	bottomRightCorner: { x: number; y: number }
}

interface Jscanify {
	extractPaper(
		canvas: HTMLCanvasElement,
		w: number,
		h: number,
		corners: CornerPoints
	): HTMLCanvasElement
}

interface OpenCV {
	// Mat constructors
	Mat: {
		new (): CvMat
		new (rows: number, cols: number, type: number): CvMat
	}
	MatVector: { new (): CvMatVector }
	Size: { new (width: number, height: number): CvSize }
	Scalar: { new (...values: number[]): CvScalar }

	// I/O
	imread(canvas: HTMLCanvasElement): CvMat
	imshow(canvas: HTMLCanvasElement, mat: CvMat): void

	// Color conversion
	cvtColor(src: CvMat, dst: CvMat, code: number): void

	// Edge detection
	Canny(src: CvMat, dst: CvMat, threshold1: number, threshold2: number): void

	// Filtering
	GaussianBlur(
		src: CvMat,
		dst: CvMat,
		ksize: CvSize,
		sigmaX: number,
		sigmaY?: number,
		borderType?: number
	): void
	adaptiveThreshold(
		src: CvMat,
		dst: CvMat,
		maxValue: number,
		method: number,
		type: number,
		blockSize: number,
		C: number
	): void
	threshold(src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number): void

	// Channel operations
	split(src: CvMat, channels: CvMatVector): void
	merge(channels: CvMatVector, dst: CvMat): void

	// Morphology
	morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void
	getStructuringElement(shape: number, ksize: CvSize): CvMat

	// Geometric
	resize(
		src: CvMat,
		dst: CvMat,
		dsize: CvSize,
		fx: number,
		fy: number,
		interpolation: number
	): void

	// Contours
	findContours(
		image: CvMat,
		contours: CvMatVector,
		hierarchy: CvMat,
		mode: number,
		method: number
	): void
	contourArea(contour: CvMat): number
	minAreaRect(contour: CvMat): CvRotatedRect

	// Perspective transform
	getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat
	warpPerspective(
		src: CvMat,
		dst: CvMat,
		M: CvMat,
		dsize: CvSize,
		flags?: number,
		borderMode?: number,
		borderValue?: CvScalar
	): void
	matFromArray(rows: number, cols: number, type: number, data: number[]): CvMat

	// Arithmetic
	divide(src1: CvMat, src2: CvMat, dst: CvMat): void
	multiply(src1: CvMat, src2: CvMat, dst: CvMat): void
	addWeighted(
		src1: CvMat,
		alpha: number,
		src2: CvMat,
		beta: number,
		gamma: number,
		dst: CvMat
	): void

	// Histogram
	equalizeHist(src: CvMat, dst: CvMat): void

	// Color conversion constants
	COLOR_RGBA2RGB: number
	COLOR_RGB2Lab: number
	COLOR_Lab2RGB: number
	COLOR_RGB2RGBA: number
	COLOR_RGBA2GRAY: number
	COLOR_GRAY2RGBA: number
	COLOR_RGB2GRAY: number

	// Morphology constants
	MORPH_ELLIPSE: number
	MORPH_CLOSE: number

	// Type constants
	CV_32F: number
	CV_32FC2: number
	CV_8U: number

	// Interpolation constants
	INTER_AREA: number
	INTER_LINEAR: number

	// Threshold constants
	ADAPTIVE_THRESH_GAUSSIAN_C: number
	THRESH_BINARY: number
	THRESH_OTSU: number

	// Contour constants
	RETR_CCOMP: number
	RETR_EXTERNAL: number
	CHAIN_APPROX_SIMPLE: number

	// Border constants
	BORDER_DEFAULT: number
	BORDER_CONSTANT: number

	// Runtime initialization
	onRuntimeInitialized?: (() => void) | undefined
	then?: (cb: () => void) => void
}

declare const cv: OpenCV
