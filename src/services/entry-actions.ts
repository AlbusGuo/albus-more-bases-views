import {
	ListValue,
	Notice,
	parsePropertyId,
	TFile,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';

export type AttachmentOpenMode = 'obsidian' | 'system';

interface NativeAppWithSystemOpen extends App {
	openWithDefaultApp?: (path: string) => Promise<void> | void;
}

const TRUE_STATUS_VALUES = new Set(['true', 'yes', 'x', '- [x]', 'done']);

export function getStatus(value: Value | null): boolean {
	if (value === null) return false;
	const normalized = value.toString().trim().toLowerCase();
	if (!normalized) return false;
	if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
		return Number(normalized) !== 0;
	}
	return TRUE_STATUS_VALUES.has(normalized);
}

export async function updateStatus(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	checked: boolean,
): Promise<void> {
	const parsedProperty = parsePropertyId(property);
	if (parsedProperty.type !== 'note') return;
	await app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
		const writableFrontmatter = frontmatter as Record<string, unknown>;
		writableFrontmatter[parsedProperty.name] = checked;
	});
}

export async function openAttachment(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	openWith: AttachmentOpenMode,
): Promise<void> {
	const target = getFirstTarget(entry.getValue(property)) ?? entry.file.path;

	if (openWith === 'obsidian') {
		await app.workspace.openLinkText(target, entry.file.path, true);
		return;
	}

	if (/^https?:\/\//i.test(target)) {
		activeWindow.open(target, '_blank', 'noopener');
		return;
	}

	const linkedFile = app.metadataCache.getFirstLinkpathDest(
		cleanLinkTarget(target),
		entry.file.path,
	);
	if (!(linkedFile instanceof TFile)) {
		new Notice('未找到对应的附件文件.');
		return;
	}

	const nativeApp = app as NativeAppWithSystemOpen;
	if (nativeApp.openWithDefaultApp) {
		await nativeApp.openWithDefaultApp(linkedFile.path);
		return;
	}

	await app.workspace.openLinkText(linkedFile.path, entry.file.path, true);
}

function getFirstTarget(value: Value | null): string | null {
	if (value === null) return null;
	if (value instanceof ListValue) {
		for (let index = 0; index < value.length(); index += 1) {
			const target = getFirstTarget(value.get(index));
			if (target) return target;
		}
		return null;
	}

	const text = value.toString().trim();
	if (!text) return null;
	const markdownLink = text.match(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))/);
	if (markdownLink) return markdownLink[1] ?? markdownLink[2] ?? null;
	const wikiLink = text.match(/!?\[\[([^\]]+)\]\]/);
	if (wikiLink?.[1]) return wikiLink[1];
	return text;
}

function cleanLinkTarget(target: string): string {
	let cleanTarget = target.trim();
	const aliasIndex = cleanTarget.indexOf('|');
	if (aliasIndex >= 0) cleanTarget = cleanTarget.slice(0, aliasIndex);
	const subpathIndex = cleanTarget.indexOf('#');
	if (subpathIndex >= 0) cleanTarget = cleanTarget.slice(0, subpathIndex);
	return cleanTarget.trim();
}
