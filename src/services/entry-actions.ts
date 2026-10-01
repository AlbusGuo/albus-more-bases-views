import {
	ListValue,
	Notice,
	NullValue,
	parsePropertyId,
	TFile,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';

export type AttachmentOpenMode = 'obsidian' | 'system';
export const READING_STATUS_VALUES = ['已阅', '阅读中', '未读'] as const;
export type ReadingStatus = typeof READING_STATUS_VALUES[number];

interface NativeAppWithSystemOpen extends App {
	openWithDefaultApp?: (path: string) => Promise<void> | void;
}

const TRUE_STATUS_VALUES = new Set(['true', 'yes', 'x', '- [x]', 'done']);

export function getReadingStatus(value: Value | null): ReadingStatus {
	if (value === null || value instanceof NullValue) return '未读';
	const normalized = value.toString().trim().toLowerCase();
	if (normalized === '已阅') return '已阅';
	if (normalized === '阅读中') return '阅读中';
	if (normalized === '未读') return '未读';
	return isTruthyStatus(normalized) ? '已阅' : '未读';
}

export async function updateReadingStatus(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	status: ReadingStatus,
): Promise<void> {
	await updateNoteProperty(app, entry, property, status);
}

export async function updateTextStatus(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	status: string,
): Promise<void> {
	await updateNoteProperty(app, entry, property, status);
}

async function updateNoteProperty(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	value: unknown,
): Promise<void> {
	const parsedProperty = parsePropertyId(property);
	if (parsedProperty.type !== 'note') return;
	await app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
		const writableFrontmatter = frontmatter as Record<string, unknown>;
		writableFrontmatter[parsedProperty.name] = value;
	});
}

export async function openAttachment(
	app: App,
	entry: BasesEntry,
	property: BasesPropertyId,
	openWith: AttachmentOpenMode,
): Promise<void> {
	const target = getFirstTarget(entry.getValue(property));
	if (!target) {
		new Notice('未找到对应的附件文件.');
		return;
	}

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

export function hasAttachment(
	entry: BasesEntry,
	property: BasesPropertyId | null,
): boolean {
	return property !== null && getFirstTarget(entry.getValue(property)) !== null;
}

function getFirstTarget(value: Value | null): string | null {
	if (value === null || value instanceof NullValue) return null;
	if (value instanceof ListValue) {
		for (let index = 0; index < value.length(); index += 1) {
			const target = getFirstTarget(value.get(index));
			if (target) return target;
		}
		return null;
	}

	const text = value.toString().trim();
	if (!text || text.toLowerCase() === 'null') return null;
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

function isTruthyStatus(normalized: string): boolean {
	if (TRUE_STATUS_VALUES.has(normalized)) return true;
	return /^-?\d+(?:\.\d+)?$/u.test(normalized) && Number(normalized) !== 0;
}
