import { normalizePath, type App } from 'obsidian';

const PACK_URI_PREFIX = 'mbvpack://';
const PACK_DIRECTORY = 'view-packs';
const PACK_MAGIC = 'MBVPACK1';
const PACK_FIXED_HEADER_SIZE = 12;
const MAXIMUM_PACK_BYTES = 128 * 1024 * 1024;
const MAXIMUM_HEADER_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface ViewPackEntry {
	offset: number;
	length: number;
	mimeType: string;
	sha256: string;
}

interface ViewPackHeader {
	format: 'more-bases-view-pack';
	schemaVersion: 1;
	id: string;
	pluginVersion: string;
	payloadSha256: string;
	entries: Record<string, ViewPackEntry>;
}

export type ViewPackLoadResult =
	| { status: 'loaded'; pack: LoadedViewPack }
	| { status: 'missing'; path: string }
	| { status: 'invalid'; path: string; message: string };

const loadedPacks = new Map<string, LoadedViewPack>();
const resolvedPackResources = new Map<string, {
	pack: LoadedViewPack;
	logicalPath: string;
}>();

export class LoadedViewPack {
	private readonly urls = new Map<string, string>();

	constructor(
		readonly id: string,
		readonly sourcePath: string,
		private readonly buffer: ArrayBuffer,
		private readonly dataOffset: number,
		private readonly entries: Readonly<Record<string, ViewPackEntry>>,
	) {}

	resolve(logicalPath: string): string {
		const cached = this.urls.get(logicalPath);
		if (cached) return cached;
		const entry = this.entries[logicalPath];
		if (!entry) throw new Error(`拓展包缺少资源: ${logicalPath}`);
		const start = this.dataOffset + entry.offset;
		const contents = new Uint8Array(this.buffer, start, entry.length);
		const url = URL.createObjectURL(new Blob([contents], { type: entry.mimeType }));
		this.urls.set(logicalPath, url);
		resolvedPackResources.set(url, { pack: this, logicalPath });
		return url;
	}

	read(logicalPath: string): { contents: Uint8Array<ArrayBuffer>; mimeType: string } | null {
		const entry = this.entries[logicalPath];
		if (!entry) return null;
		return {
			contents: new Uint8Array(
				this.buffer,
				this.dataOffset + entry.offset,
				entry.length,
			),
			mimeType: entry.mimeType,
		};
	}

	destroy(): void {
		for (const url of this.urls.values()) {
			resolvedPackResources.delete(url);
			URL.revokeObjectURL(url);
		}
		this.urls.clear();
	}
}

export class ViewPackManager {
	private readonly packs = new Map<string, LoadedViewPack>();
	private readonly pending = new Map<string, Promise<ViewPackLoadResult>>();

	constructor(
		private readonly app: App,
		private readonly pluginDirectory: string | undefined,
		private readonly pluginVersion: string,
	) {}

	getPath(id: string): string {
		const filename = `${id}.mbvpack`;
		return this.pluginDirectory
			? normalizePath(`${this.pluginDirectory}/${PACK_DIRECTORY}/${filename}`)
			: normalizePath(`${PACK_DIRECTORY}/${filename}`);
	}

	load(id: string): Promise<ViewPackLoadResult> {
		const loaded = this.packs.get(id);
		if (loaded) return Promise.resolve({ status: 'loaded', pack: loaded });
		const pending = this.pending.get(id);
		if (pending) return pending;
		const task = this.loadFromDisk(id).finally(() => this.pending.delete(id));
		this.pending.set(id, task);
		return task;
	}

	async install(id: string, buffer: ArrayBuffer): Promise<ViewPackLoadResult> {
		const path = this.getPath(id);
		try {
			const pack = await parseViewPack(
				buffer,
				id,
				this.pluginVersion,
				path,
				true,
			);
			if (!this.pluginDirectory) {
				pack.destroy();
				return { status: 'invalid', path, message: '插件目录不可用.' };
			}
			const directory = normalizePath(`${this.pluginDirectory}/${PACK_DIRECTORY}`);
			if (!await this.app.vault.adapter.exists(directory)) {
				await this.app.vault.adapter.mkdir(directory);
			}
			await this.app.vault.adapter.writeBinary(path, buffer);
			this.replace(pack);
			return { status: 'loaded', pack };
		} catch (error) {
			return {
				status: 'invalid',
				path,
				message: error instanceof Error ? error.message : '拓展包无效.',
			};
		}
	}

	destroy(): void {
		for (const pack of this.packs.values()) {
			if (loadedPacks.get(pack.id) === pack) loadedPacks.delete(pack.id);
			pack.destroy();
		}
		this.packs.clear();
		this.pending.clear();
	}

	private async loadFromDisk(id: string): Promise<ViewPackLoadResult> {
		const path = this.getPath(id);
		if (!this.pluginDirectory || !await this.app.vault.adapter.exists(path)) {
			return { status: 'missing', path };
		}
		try {
			const buffer = await this.app.vault.adapter.readBinary(path);
			const pack = await parseViewPack(
				buffer,
				id,
				this.pluginVersion,
				path,
				false,
			);
			this.replace(pack);
			return { status: 'loaded', pack };
		} catch (error) {
			return {
				status: 'invalid',
				path,
				message: error instanceof Error ? error.message : '拓展包无效.',
			};
		}
	}

	private replace(pack: LoadedViewPack): void {
		const previous = this.packs.get(pack.id);
		if (previous && previous !== pack) previous.destroy();
		this.packs.set(pack.id, pack);
		loadedPacks.set(pack.id, pack);
	}
}

export function resolveViewPackAsset(source: string): string | null {
	if (!source.startsWith(PACK_URI_PREFIX)) return null;
	const reference = source.slice(PACK_URI_PREFIX.length);
	const separator = reference.indexOf('/');
	if (separator <= 0 || separator === reference.length - 1) {
		throw new Error(`拓展包资源引用无效: ${source}`);
	}
	const id = reference.slice(0, separator);
	const logicalPath = reference.slice(separator + 1);
	const pack = loadedPacks.get(id);
	if (!pack) throw new Error(`拓展包尚未加载: ${id}`);
	return pack.resolve(logicalPath);
}

export function readResolvedViewPackAsset(source: string): {
	contents: Uint8Array<ArrayBuffer>;
	mimeType: string;
} | null {
	const resource = resolvedPackResources.get(source);
	return resource?.pack.read(resource.logicalPath) ?? null;
}

async function parseViewPack(
	buffer: ArrayBuffer,
	expectedId: string,
	expectedPluginVersion: string,
	sourcePath: string,
	verifyIntegrity: boolean,
): Promise<LoadedViewPack> {
	if (buffer.byteLength > MAXIMUM_PACK_BYTES) throw new Error('拓展包超过 128 MiB 限制.');
	if (buffer.byteLength < PACK_FIXED_HEADER_SIZE) throw new Error('拓展包文件不完整.');
	const bytes = new Uint8Array(buffer);
	const magic = new TextDecoder().decode(bytes.subarray(0, 8));
	if (magic !== PACK_MAGIC) throw new Error('拓展包标识无效.');
	const headerLength = new DataView(buffer).getUint32(8, true);
	if (headerLength <= 0 || headerLength > MAXIMUM_HEADER_BYTES) {
		throw new Error('拓展包索引长度无效.');
	}
	const dataOffset = PACK_FIXED_HEADER_SIZE + headerLength;
	if (dataOffset > buffer.byteLength) throw new Error('拓展包索引已截断.');
	const rawHeader: unknown = JSON.parse(
		new TextDecoder().decode(bytes.subarray(PACK_FIXED_HEADER_SIZE, dataOffset)),
	);
	const header = validateHeader(
		rawHeader,
		expectedId,
		expectedPluginVersion,
		buffer.byteLength - dataOffset,
	);
	if (verifyIntegrity) {
		const payloadHash = await sha256Hex(bytes.subarray(dataOffset));
		if (payloadHash !== header.payloadSha256) throw new Error('拓展包内容校验失败.');
	}
	return new LoadedViewPack(
		header.id,
		sourcePath,
		buffer,
		dataOffset,
		header.entries,
	);
}

function validateHeader(
	value: unknown,
	expectedId: string,
	expectedPluginVersion: string,
	payloadLength: number,
): ViewPackHeader {
	if (!value || typeof value !== 'object') throw new Error('拓展包索引无效.');
	const record = value as Partial<ViewPackHeader>;
	if (
		record.format !== 'more-bases-view-pack' ||
		record.schemaVersion !== 1 ||
		record.id !== expectedId ||
		record.pluginVersion !== expectedPluginVersion ||
		!record.payloadSha256 ||
		!/^[a-f0-9]{64}$/u.test(record.payloadSha256) ||
		!record.entries ||
		typeof record.entries !== 'object'
	) throw new Error(`拓展包与插件 ${expectedPluginVersion} 不兼容.`);
	for (const [logicalPath, entry] of Object.entries(record.entries)) {
		if (
			!logicalPath || logicalPath.includes('..') || logicalPath.includes('\\') ||
			!entry || typeof entry !== 'object' ||
			!Number.isSafeInteger(entry.offset) || entry.offset < 0 ||
			!Number.isSafeInteger(entry.length) || entry.length <= 0 ||
			entry.offset + entry.length > payloadLength ||
			!ALLOWED_MIME_TYPES.has(entry.mimeType) ||
			!/^[a-f0-9]{64}$/u.test(entry.sha256)
		) throw new Error(`拓展包资源索引无效: ${logicalPath}`);
	}
	return record as ViewPackHeader;
}

async function sha256Hex(contents: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', contents);
	return Array.from(new Uint8Array(digest), byte =>
		byte.toString(16).padStart(2, '0')).join('');
}
