import { resolveViewPackAsset } from '../services/view-pack-manager';

type PackedBundledImage = readonly [mimeType: string, contents: string, byteLength: number];
type LazyBundledImage = () => string | PackedBundledImage;
const BASE85_ALPHABET = '!#%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz';
const BASE85_VALUES = createBase85Values();
const resolvedImages = new WeakMap<LazyBundledImage, string>();

export function resolveBundledImage(source: string | LazyBundledImage): string {
	if (typeof source === 'string') return resolveViewPackAsset(source) ?? source;
	const cached = resolvedImages.get(source);
	if (cached) return cached;
	const loaded = source();
	const resolved = typeof loaded === 'string' ? loaded
		: `data:${loaded[0]};base64,${encodeBase64(decodeBase85(loaded[1], loaded[2]))}`;
	resolvedImages.set(source, resolved);
	return resolved;
}

function createBase85Values(): Int16Array {
	const values = new Int16Array(128);
	values.fill(-1);
	for (let index = 0; index < BASE85_ALPHABET.length; index += 1) {
		values[BASE85_ALPHABET.charCodeAt(index)] = index;
	}
	return values;
}

function decodeBase85(contents: string, byteLength: number): Uint8Array {
	const bytes = new Uint8Array(byteLength);
	let target = 0;
	for (let offset = 0; offset < contents.length; offset += 5) {
		let value = 0;
		for (let index = 0; index < 5; index += 1) {
			const digit = BASE85_VALUES[contents.charCodeAt(offset + index)];
			if (digit === undefined || digit < 0) throw new Error('内置图像资源已损坏.');
			value = value * 85 + digit;
		}
		for (let shift = 24; shift >= 0 && target < byteLength; shift -= 8) {
			bytes[target] = Math.floor(value / 2 ** shift) & 0xff;
			target += 1;
		}
	}
	return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}
