import {
	type App,
	ListValue,
	normalizePath,
	TFile,
	type Value,
} from 'obsidian';

const IMAGE_EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp',
]);

export function resolveImageSource(
	app: App,
	value: Value,
	sourceFile: TFile,
): string | null {
	return resolveCandidates(app, collectCandidates(value), sourceFile);
}

export function resolveImageFile(
	app: App,
	value: Value,
	sourceFile: TFile,
): TFile | null {
	for (const candidate of collectCandidates(value)) {
		if (resolveRemoteSource(candidate)) continue;
		const imageFile = resolveCandidateFile(app, candidate, sourceFile);
		if (imageFile) return imageFile;
	}
	return null;
}

export function resolveImageTextSource(app: App, value: string, sourceFile: TFile): string | null {
	return resolveCandidates(app, collectTextCandidates(value), sourceFile);
}

function resolveCandidates(app: App, candidates: readonly string[], sourceFile: TFile): string | null {
	for (const candidate of candidates) {
		const remoteSource = resolveRemoteSource(candidate);
		if (remoteSource) return remoteSource;

		const cleanPath = cleanVaultPath(candidate);
		if (!cleanPath) continue;
		const imageFile = resolveCandidateFile(app, cleanPath, sourceFile);
		if (imageFile) return app.vault.getResourcePath(imageFile);
	}
	return null;
}

function resolveCandidateFile(
	app: App,
	candidate: string,
	sourceFile: TFile,
): TFile | null {
	const cleanPath = cleanVaultPath(candidate);
	if (!cleanPath) return null;
	const linkedFile = app.metadataCache.getFirstLinkpathDest(
		cleanPath,
		sourceFile.path,
	);
	const directFile = app.vault.getFileByPath(normalizePath(cleanPath));
	const imageFile = linkedFile ?? directFile;
	return isImageFile(imageFile) ? imageFile : null;
}

export function resolveRenderedImageSource(
	app: App,
	value: Value,
	ownerDocument: Document,
): string | null {
	const container = ownerDocument.createElement('div');
	value.renderTo(container, app.renderContext);
	const image = container.querySelector('img');
	const source = image?.currentSrc || image?.getAttribute('src') || image?.src;
	container.remove();
	return source || null;
}

function collectCandidates(value: Value): string[] {
	if (value instanceof ListValue) {
		const candidates: string[] = [];
		for (let index = 0; index < value.length(); index += 1) {
			candidates.push(...collectCandidates(value.get(index)));
		}
		return candidates;
	}

	return collectTextCandidates(value.toString());
}

function collectTextCandidates(value: string): string[] {
	const text = value.trim();
	if (!text) return [];
	const markdownImage = text.match(/!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))/);
	if (markdownImage) {
		const path = markdownImage[1] ?? markdownImage[2];
		if (path) return [path];
	}
	const markdownLink = text.match(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))/);
	if (markdownLink) {
		const path = markdownLink[1] ?? markdownLink[2];
		if (path) return [path];
	}
	const htmlImage = text.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
	if (htmlImage?.[1]) return [htmlImage[1]];
	const wikiLink = text.match(/!?\[\[([^\]]+)\]\]/);
	if (wikiLink?.[1]) return [wikiLink[1]];
	return [text];
}

function resolveRemoteSource(candidate: string): string | null {
	const value = candidate.trim();
	if (/^https?:\/\//i.test(value)) return value;
	if (/^data:image\//i.test(value)) return value;
	if (/^app:\/\//i.test(value)) return value;
	return null;
}

function cleanVaultPath(candidate: string): string {
	let path = candidate.trim();
	if (path.startsWith('<') && path.endsWith('>')) {
		path = path.slice(1, -1).trim();
	}
	const aliasIndex = path.indexOf('|');
	if (aliasIndex >= 0) path = path.slice(0, aliasIndex);
	const subpathIndex = path.indexOf('#');
	if (subpathIndex >= 0) path = path.slice(0, subpathIndex);
	return path.trim();
}

export function isImageFile(file: TFile | null): file is TFile {
	return file instanceof TFile && IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}
