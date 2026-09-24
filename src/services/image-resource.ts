import { requestUrl } from 'obsidian';
import { readResolvedViewPackAsset } from './view-pack-manager';

export async function readAsDataUrl(source: string): Promise<string | null> {
	if (source.startsWith('data:')) return source;
	const packed = readResolvedViewPackAsset(source);
	if (packed) return bytesToDataUrl(packed.contents, packed.mimeType);
	if (source.startsWith('blob:') || source.startsWith('app:')) return readLocalResource(source);
	try {
		const response = await requestUrl({ url: source, throw: false });
		if (response.status >= 400) return null;
		return arrayBufferToDataUrl(response.arrayBuffer, response.headers['content-type']?.split(';')[0] || inferMimeType(source));
	} catch { return readLocalResource(source); }
}
async function readLocalResource(source: string): Promise<string | null> {
	try {
		const response = await window['fetch'](source);
		if (!response.ok && response.status !== 0) return null;
		const blob = await response.blob();
		return await new Promise(resolve => {
			const reader = new FileReader();
			reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : null), { once: true });
			reader.addEventListener('error', () => resolve(null), { once: true }); reader.readAsDataURL(blob);
		});
	} catch { return null; }
}
export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
	return bytesToDataUrl(new Uint8Array(buffer), mimeType);
}
function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	return `data:${mimeType};base64,${btoa(binary)}`;
}
function inferMimeType(source: string): string {
	const path = source.split(/[?#]/)[0]?.toLowerCase() ?? '';
	if (path.endsWith('.svg')) return 'image/svg+xml';
	if (path.endsWith('.webp')) return 'image/webp';
	if (path.endsWith('.gif')) return 'image/gif';
	if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
	return 'image/png';
}

/** Bounded per-view cache; no raw image data retained on detached card controllers. */
export class ImageResourceCache {
	private readonly values = new Map<string, string>();
	private readonly pending = new Map<string, Promise<string>>();
	private readonly queue: (() => void)[] = [];
	private running = 0;
	private disposed = false;
	get(source: string): Promise<string> {
		if (!source || source.startsWith('data:')) return Promise.resolve(source);
		const cached = this.values.get(source);
		if (cached) { this.values.delete(source); this.values.set(source, cached); return Promise.resolve(cached); }
		const pending = this.pending.get(source); if (pending) return pending;
		const result = new Promise<string>(resolve => {
			this.queue.push(() => { void (async () => {
				const value = this.disposed ? '' : await readAsDataUrl(source) ?? '';
				if (!this.disposed && value) {
					this.values.set(source, value);
					let bytes = [...this.values.values()].reduce((sum, item) => sum + item.length, 0);
					while (this.values.size > 24 || bytes > 12 * 1024 * 1024) {
						const key = this.values.keys().next().value; if (!key) break;
						bytes -= this.values.get(key)?.length ?? 0; this.values.delete(key);
					}
				}
				this.pending.delete(source); this.running--; resolve(value); this.pump();
			})(); });
		});
		this.pending.set(source, result); this.pump(); return result;
	}
	destroy(): void { this.disposed = true; this.values.clear(); this.pump(); }
	private pump(): void { while (this.running < 4 && this.queue.length) { this.running++; this.queue.shift()?.(); } }
}
