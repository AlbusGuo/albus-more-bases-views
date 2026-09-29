import {
	ListValue,
	normalizePath,
	parsePropertyId,
	type App,
	type BasesPropertyId,
	type TFile,
	type Value,
} from 'obsidian';

export interface PropertyChange {
	before: unknown;
	after: unknown;
}

export type EditablePropertyType =
	| 'text'
	| 'list'
	| 'number'
	| 'boolean'
	| 'date'
	| 'datetime';

interface InternalMetadataTypeInfo {
	expected?: { type?: string };
	inferred?: { type?: string };
}

interface InternalMetadataTypeManager {
	getAssignedWidget?: (property: string) => string | null | undefined;
	getTypeInfo?: (property: string, value?: unknown) => InternalMetadataTypeInfo;
}

interface InternalApp extends App {
	metadataTypeManager?: InternalMetadataTypeManager;
}

export function writablePropertyName(
	property: BasesPropertyId | null,
): string | null {
	if (!property) return null;
	const parsed = parsePropertyId(property);
	return parsed.type === 'note' ? parsed.name : null;
}

export function getEditablePropertyType(
	app: App,
	property: BasesPropertyId | null,
	value?: unknown,
): EditablePropertyType | null {
	const name = writablePropertyName(property);
	if (!name) return null;
	const manager = (app as InternalApp).metadataTypeManager;
	const assigned = manager?.getAssignedWidget?.(name);
	const info = manager?.getTypeInfo?.(name, value);
	const type = assigned ?? info?.expected?.type ?? info?.inferred?.type;
	if (type === 'multitext' || type === 'aliases' || type === 'tags') return 'list';
	if (type === 'checkbox') return 'boolean';
	if (type === 'number') return 'number';
	if (type === 'date') return 'date';
	if (type === 'datetime') return 'datetime';
	return type === 'text' ? 'text' : null;
}

export function readFrontmatter(
	app: App,
	file: TFile,
): Record<string, unknown> | undefined {
	return app.metadataCache.getFileCache(file)?.frontmatter;
}

export function unwrapBasesValue(value: Value | null): unknown {
	if (!value) return undefined;
	if (value instanceof ListValue) {
		return Array.from(
			{ length: value.length() },
			(_, index) => unwrapBasesValue(value.get(index)),
		);
	}
	return value.toString();
}

export function valueText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
	if (
		typeof value === 'string' || typeof value === 'number' ||
		typeof value === 'boolean' || typeof value === 'bigint'
	) return String(value).trim();
	return '';
}

export async function savePropertyChanges(
	app: App,
	file: TFile,
	changes: ReadonlyMap<string, PropertyChange>,
): Promise<void> {
	const current = app.vault.getFileByPath(file.path);
	if (!current || current !== file) throw new Error('笔记已移动或删除.');
	await app.fileManager.processFrontMatter(current, (frontmatter) => {
		const record = frontmatter as Record<string, unknown>;
		for (const [property, change] of changes) {
			if (!sameValue(record[property], change.before)) {
				throw new Error(`${property} 已发生变化, 请重新打开编辑器.`);
			}
		}
		for (const [property, change] of changes) {
			if (change.after === undefined) delete record[property];
			else record[property] = change.after;
		}
	});
}

export async function renameNoteFile(
	app: App,
	file: TFile,
	enteredName: string,
): Promise<string> {
	const entered = enteredName.trim();
	if (!entered) throw new Error('文件名不能为空.');
	if (/[\\/:*?"<>|]/u.test(entered)) throw new Error('文件名包含无效字符.');
	const extension = file.extension ? `.${file.extension}` : '';
	const basename = extension && entered.toLowerCase().endsWith(extension.toLowerCase())
		? entered.slice(0, -extension.length).trim()
		: entered;
	if (!basename) throw new Error('文件名不能为空.');
	if (basename === file.basename) return basename;
	const separator = file.path.lastIndexOf('/');
	const folder = separator >= 0 ? file.path.slice(0, separator + 1) : '';
	await app.fileManager.renameFile(
		file,
		normalizePath(`${folder}${basename}${extension}`),
	);
	return basename;
}

export function sameValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
