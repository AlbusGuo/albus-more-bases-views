import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_FILTER = /\.(?:png|jpe?g|webp)$/;
const BASE85_ALPHABET = '!#%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz';
const VIEW_PACK_MAGIC = Buffer.from('MBVPACK1', 'ascii');
const VIEW_PACK_DEFINITIONS = [
	{
		id: 'hearthstone',
		matches: (relativePath) => relativePath.startsWith('hearthstone/') ||
			relativePath === 'card/hearthstone-legend-card-back.webp',
		inherits: ['card'],
	},
	{
		id: 'operator',
		matches: (relativePath) => relativePath.startsWith('operator/'),
	},
	{
		id: 'card',
		matches: (relativePath) => relativePath.startsWith('card/materials/'),
	},
];

export function lazyImagePlugin() {
	const assetsRoot = path.resolve('assets') + path.sep;
	const viewPackAssets = new Map(
		VIEW_PACK_DEFINITIONS.map(({ id }) => [id, new Map()]),
	);
	return {
		name: 'lazy-images',
		setup(build) {
			build.onResolve({ filter: IMAGE_FILTER }, (args) => {
				const absolutePath = path.resolve(args.resolveDir, args.path);
				if (!absolutePath.startsWith(assetsRoot)) return null;
				return { path: absolutePath, namespace: 'mbv-private-image' };
			});
			build.onLoad({ filter: IMAGE_FILTER, namespace: 'mbv-private-image' }, async (args) => {
				const relativePath = path.relative(assetsRoot, args.path).replaceAll(path.sep, '/');
				const pack = VIEW_PACK_DEFINITIONS.find(({ matches }) => matches(relativePath));
				if (pack) {
					viewPackAssets.get(pack.id)?.set(relativePath, args.path);
					return {
						contents: `export default ${JSON.stringify(`mbvpack://${pack.id}/${relativePath}`)}`,
						loader: 'js',
						watchFiles: [args.path],
					};
				}
				const contents = await readFile(args.path);
				const source = encodeBase85(contents);
				return {
					contents: `export default function loadBundledImage(){return [${JSON.stringify(mimeType(args.path))},${JSON.stringify(source)},${contents.length}]}`,
					loader: 'js',
					watchFiles: [args.path],
				};
			});
			build.onEnd(async (result) => {
				if (result.errors.length) return;
				const outfile = build.initialOptions.outfile;
				if (!outfile) throw new Error('View pack build requires a single outfile.');
				const directory = path.join(path.dirname(outfile), 'view-packs');
				await mkdir(directory, { recursive: true });
				await Promise.all(VIEW_PACK_DEFINITIONS.map(({ id, inherits = [] }) => {
					const assets = new Map(viewPackAssets.get(id));
					for (const inheritedId of inherits) {
						for (const asset of viewPackAssets.get(inheritedId) ?? []) {
							assets.set(...asset);
						}
					}
					const destination = path.join(directory, `${id}.mbvpack`);
					return writeViewPackIfAvailable(destination, id, assets);
				}));
			});
		},
	};
}

async function writeViewPackIfAvailable(destination, id, assetPaths) {
	if (!assetPaths.size || !await allFilesExist(assetPaths.values())) {
		await rm(destination, { force: true });
		return;
	}
	await writeViewPack(destination, id, assetPaths);
}

async function allFilesExist(filePaths) {
	for (const filePath of filePaths) {
		try {
			await access(filePath);
		} catch {
			return false;
		}
	}
	return true;
}

async function writeViewPack(destination, id, assetPaths) {
	const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
	if (typeof manifest.version !== 'string' || !manifest.version) {
		throw new Error('View pack build requires a plugin version.');
	}
	const assets = await Promise.all(
		[...assetPaths].sort(([left], [right]) => left.localeCompare(right)).map(
			async ([logicalPath, filePath]) => ({
				logicalPath,
				contents: await readFile(filePath),
				mimeType: mimeType(filePath),
			}),
		),
	);
	let offset = 0;
	const entries = {};
	for (const asset of assets) {
		entries[asset.logicalPath] = {
			offset,
			length: asset.contents.length,
			mimeType: asset.mimeType,
			sha256: createHash('sha256').update(asset.contents).digest('hex'),
		};
		offset += asset.contents.length;
	}
	const header = Buffer.from(JSON.stringify({
		format: 'more-bases-view-pack',
		schemaVersion: 1,
		id,
		pluginVersion: manifest.version,
		payloadSha256: createPayloadHash(assets),
		entries,
	}), 'utf8');
	const headerLength = Buffer.alloc(4);
	headerLength.writeUInt32LE(header.length);
	await writeFile(destination, Buffer.concat([
		VIEW_PACK_MAGIC,
		headerLength,
		header,
		...assets.map(asset => asset.contents),
	]));
}

function createPayloadHash(assets) {
	const hash = createHash('sha256');
	for (const asset of assets) hash.update(asset.contents);
	return hash.digest('hex');
}

function encodeBase85(contents) {
	let encoded = '';
	for (let offset = 0; offset < contents.length; offset += 4) {
		let value = 0;
		for (let index = 0; index < 4; index += 1) value = value * 256 + (contents[offset + index] ?? 0);
		let block = '';
		for (let index = 0; index < 5; index += 1) {
			block = BASE85_ALPHABET[value % 85] + block;
			value = Math.floor(value / 85);
		}
		encoded += block;
	}
	return encoded;
}

function mimeType(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (extension === '.webp') return 'image/webp';
	if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
	return 'image/png';
}
