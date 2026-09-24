const OPERATOR_ARTWORK_ASPECT_RATIO = 110 / 218;
const OPERATOR_ARTWORK_OVERSCAN = 0.12;
const MAX_CACHE_ENTRIES = 72;
const MAX_CACHE_PIXELS = 40_000_000;
const MAX_CONCURRENT_JOBS = 2;

export interface OperatorArtworkRasterRequest {
	source: string;
	x: number;
	y: number;
	scale: number;
	cardWidth: number;
	devicePixelRatio: number;
}

export interface OperatorArtworkRasterResult {
	source: string;
	key: string;
	cropped: boolean;
}

interface CacheEntry {
	result: OperatorArtworkRasterResult;
	lastUsed: number;
	pixels: number;
}

interface QueuedJob {
	run: () => Promise<void>;
}

/**
 * Converts the large transparent operator artwork into a small viewport-sized
 * texture. The original image is decoded only while a job is running and is
 * never retained by the cache.
 */
export class OperatorArtworkRasterizer {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly pending = new Map<string, Promise<OperatorArtworkRasterResult>>();
	private readonly queue: QueuedJob[] = [];
	private activeJobs = 0;
	private usageSequence = 0;
	private destroyed = false;

	getCachedRaster(
		request: OperatorArtworkRasterRequest,
	): OperatorArtworkRasterResult | null {
		const dimensions = getRasterDimensions(
			request.cardWidth,
			request.devicePixelRatio,
		);
		const cached = this.cache.get(createRasterKey(request, dimensions.width));
		if (!cached) return null;
		cached.lastUsed = ++this.usageSequence;
		return cached.result;
	}

	getRaster(
		request: OperatorArtworkRasterRequest,
	): Promise<OperatorArtworkRasterResult> {
		const dimensions = getRasterDimensions(
			request.cardWidth,
			request.devicePixelRatio,
		);
		const key = createRasterKey(request, dimensions.width);
		const cached = this.cache.get(key);
		if (cached) {
			cached.lastUsed = ++this.usageSequence;
			return Promise.resolve(cached.result);
		}
		const existing = this.pending.get(key);
		if (existing) return existing;

		const promise = new Promise<OperatorArtworkRasterResult>((resolve) => {
			this.queue.push({
				run: async () => {
					let result: OperatorArtworkRasterResult;
					try {
						result = await createRaster(request, key, dimensions);
					} catch {
						result = { source: request.source, key, cropped: false };
					}
					this.pending.delete(key);
					if (!this.destroyed && result.cropped) {
						this.cache.set(key, {
							result,
							lastUsed: ++this.usageSequence,
							pixels: dimensions.width * dimensions.height,
						});
						this.trimCache();
					} else if (this.destroyed && result.cropped) {
						URL.revokeObjectURL(result.source);
					}
					resolve(result);
				},
			});
		});
		this.pending.set(key, promise);
		this.pumpQueue();
		return promise;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.queue.length = 0;
		for (const entry of this.cache.values()) {
			URL.revokeObjectURL(entry.result.source);
		}
		this.cache.clear();
	}

	private pumpQueue(): void {
		while (
			!this.destroyed &&
			this.activeJobs < MAX_CONCURRENT_JOBS &&
			this.queue.length > 0
		) {
			const job = this.queue.shift();
			if (!job) return;
			this.activeJobs += 1;
			void job.run().finally(() => {
				this.activeJobs -= 1;
				this.pumpQueue();
			});
		}
	}

	private trimCache(): void {
		let cachedPixels = 0;
		for (const entry of this.cache.values()) cachedPixels += entry.pixels;
		while (
			this.cache.size > MAX_CACHE_ENTRIES ||
			cachedPixels > MAX_CACHE_PIXELS
		) {
			let oldestKey: string | null = null;
			let oldestUsage = Number.POSITIVE_INFINITY;
			for (const [key, entry] of this.cache) {
				if (entry.lastUsed >= oldestUsage) continue;
				oldestKey = key;
				oldestUsage = entry.lastUsed;
			}
			if (!oldestKey) return;
			const entry = this.cache.get(oldestKey);
			if (entry) {
				URL.revokeObjectURL(entry.result.source);
				cachedPixels -= entry.pixels;
			}
			this.cache.delete(oldestKey);
		}
	}
}

interface RasterDimensions {
	width: number;
	height: number;
}

function getRasterDimensions(
	cardWidth: number,
	devicePixelRatio: number,
): RasterDimensions {
	const logicalWidth = Math.max(1, cardWidth) * 0.916667;
	const pixelWidth = logicalWidth * Math.max(1, devicePixelRatio);
	const buckets = [192, 256, 384, 512, 768, 1024, 1536, 2048];
	const width = buckets.find((bucket) => bucket >= pixelWidth) ?? 2048;
	return {
		width,
		height: Math.ceil(width / OPERATOR_ARTWORK_ASPECT_RATIO),
	};
}

function createRasterKey(
	request: OperatorArtworkRasterRequest,
	width: number,
): string {
	return [
		request.source,
		formatKeyNumber(request.x),
		formatKeyNumber(request.y),
		formatKeyNumber(request.scale),
		String(width),
	].join('\u0000');
}

function formatKeyNumber(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

async function createRaster(
	request: OperatorArtworkRasterRequest,
	key: string,
	dimensions: RasterDimensions,
): Promise<OperatorArtworkRasterResult> {
	const response = await window.fetch(request.source);
	if (!response.ok && response.status !== 0) {
		throw new Error('无法读取立绘资源.');
	}
	const blob = await response.blob();
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = createEl('canvas');
		canvas.width = dimensions.width;
		canvas.height = dimensions.height;
		const context = canvas.getContext('2d', { alpha: true });
		if (!context) throw new Error('无法创建立绘画布.');
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.clearRect(0, 0, canvas.width, canvas.height);

		const margin = OPERATOR_ARTWORK_OVERSCAN;
		const viewportWidth = canvas.width / (1 + margin * 2);
		const viewportHeight = canvas.height / (1 + margin * 2);
		const layoutWidth = viewportWidth * request.scale;
		const layoutHeight = viewportHeight * request.scale;
		const layoutLeft = viewportWidth * margin +
			viewportWidth * request.x / 100 * (1 - request.scale);
		const layoutTop = viewportHeight * margin +
			viewportHeight * request.y / 100 * (1 - request.scale);
		const containScale = Math.min(
			layoutWidth / bitmap.width,
			layoutHeight / bitmap.height,
		);
		const drawWidth = bitmap.width * containScale;
		const drawHeight = bitmap.height * containScale;
		const drawLeft = layoutLeft + (layoutWidth - drawWidth) / 2;
		const drawTop = layoutTop;
		context.drawImage(bitmap, drawLeft, drawTop, drawWidth, drawHeight);

		const output = await canvasToBlob(canvas);
		return {
			source: URL.createObjectURL(output),
			key,
			cropped: true,
		};
	} finally {
		bitmap.close();
	}
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('无法生成立绘纹理.'));
		}, 'image/png');
	});
}

export function getOperatorArtworkOverscanPercent(): number {
	return OPERATOR_ARTWORK_OVERSCAN * 100;
}
