import {
	ListValue,
	NullValue,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { IndexViewOptions } from './index-options';

export const INDEX_OTHER_CATEGORY = '其他';

export interface IndexNote {
	entry: BasesEntry;
	title: string;
	timeText: string;
	categories: string[];
	categoryLeaves: string[];
	searchText: string;
	originalIndex: number;
}

export interface IndexCategory {
	path: string;
	name: string;
	depth: number;
	count: number;
}

export type IndexSelection =
	| { mode: 'all' }
	| { mode: 'other' }
	| { mode: 'category'; category: string };

export function buildIndexNotes(
	entries: readonly BasesEntry[],
	options: IndexViewOptions,
	visibleProperties: readonly BasesPropertyId[],
): IndexNote[] {
	return entries.map((entry, originalIndex) => {
		const title = getEntryText(entry, options.titleProperty) ||
			entry.file.basename || '无标题';
		const categoryValues = getEntryTextList(entry, options.categoryProperty)
			.map(normalizeCategoryPath)
			.filter(Boolean);
		const categories = categoryValues.length === 0
			? [INDEX_OTHER_CATEGORY]
			: uniqueTexts(categoryValues);
		const searchableProperties = visibleProperties
			.map((property) => getEntryText(entry, property))
			.filter(Boolean);
		return {
			entry,
			title,
			timeText: formatIndexTime(getEntryText(entry, options.timeProperty)),
			categories,
			categoryLeaves: uniqueTexts(categories.map(getCategoryLeaf)),
			searchText: normalizeSearchText([
				title,
				...categories,
				...searchableProperties,
			].join('\n')),
			originalIndex,
		};
	});
}

export function buildIndexCategories(
	notes: readonly IndexNote[],
	categoryOrder: readonly string[] = [],
): IndexCategory[] {
	const categories = new Map<string, Set<string>>();
	for (const note of notes) {
		for (const category of note.categories) {
			if (category === INDEX_OTHER_CATEGORY) continue;
			const parts = category.split('/').filter(Boolean);
			for (let depth = 1; depth <= parts.length; depth += 1) {
				const path = parts.slice(0, depth).join('/');
				const files = categories.get(path) ?? new Set<string>();
				files.add(note.entry.file.path);
				categories.set(path, files);
			}
		}
	}
	const nodes = Array.from(categories, ([path, files]) => {
		const parts = path.split('/');
		return {
			path,
			name: parts.at(-1) ?? path,
			depth: Math.max(0, parts.length - 1),
			count: files.size,
		};
	});
	return sortCategoryTree(nodes, categoryOrder);
}

export function filterIndexNotes(
	notes: readonly IndexNote[],
	selection: IndexSelection,
	query: string,
): IndexNote[] {
	const normalizedQuery = normalizeSearchText(query);
	const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
	const filtered = notes.filter((note) => {
		if (selection.mode === 'other' && !note.categories.includes(INDEX_OTHER_CATEGORY)) {
			return false;
		}
		if (selection.mode === 'category') {
			if (!note.categories.some((category) =>
				category === selection.category || category.startsWith(`${selection.category}/`),
			)) return false;
		}
		return tokens.every((token) => note.searchText.includes(token));
	});
	if (tokens.length === 0) return filtered;
	return filtered.sort((left, right) => {
		const leftScore = getSearchScore(left, normalizedQuery);
		const rightScore = getSearchScore(right, normalizedQuery);
		return rightScore - leftScore || left.originalIndex - right.originalIndex;
	});
}

export function getEntryText(
	entry: BasesEntry,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	return getValueText(entry.getValue(property));
}

export function getValueText(value: Value | null): string {
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function getEntryTextList(
	entry: BasesEntry,
	property: BasesPropertyId | null,
): string[] {
	if (!property) return [];
	return getValueTextList(entry.getValue(property));
}

function getValueTextList(value: Value | null): string[] {
	if (!value || value instanceof NullValue) return [];
	if (value instanceof ListValue) {
		const values: string[] = [];
		for (let index = 0; index < value.length(); index += 1) {
			values.push(...getValueTextList(value.get(index)));
		}
		return uniqueTexts(values);
	}
	const text = getValueText(value);
	return text ? uniqueTexts(text.split(/[,\uFF0C\u3001]+/u)) : [];
}

function normalizeCategoryPath(value: string): string {
	return value.trim().replace(/^#+/u, '').replace(/^\/+|\/+$/gu, '');
}

function getCategoryLeaf(path: string): string {
	const parts = path.split('/').filter(Boolean);
	return parts.at(-1) ?? path;
}

function sortCategoryTree(
	categories: readonly IndexCategory[],
	categoryOrder: readonly string[],
): IndexCategory[] {
	const order = new Map(categoryOrder.map((path, index) => [path, index]));
	const children = new Map<string, IndexCategory[]>();
	for (const category of categories) {
		const parentPath = getCategoryParent(category.path);
		const siblings = children.get(parentPath) ?? [];
		siblings.push(category);
		children.set(parentPath, siblings);
	}
	for (const siblings of children.values()) {
		siblings.sort((left, right) => {
			const leftOrder = order.get(left.path);
			const rightOrder = order.get(right.path);
			if (leftOrder !== undefined || rightOrder !== undefined) {
				return (leftOrder ?? Number.MAX_SAFE_INTEGER) -
					(rightOrder ?? Number.MAX_SAFE_INTEGER);
			}
			return left.name.localeCompare(right.name, 'zh-CN');
		});
	}
	const result: IndexCategory[] = [];
	const append = (parentPath: string): void => {
		for (const category of children.get(parentPath) ?? []) {
			result.push(category);
			append(category.path);
		}
	};
	append('');
	return result;
}

function getCategoryParent(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex > 0 ? path.slice(0, separatorIndex) : '';
}

function formatIndexTime(value: string): string {
	const match = value.match(
		/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/u,
	);
	return match ? `${match[1]} ${match[2]}` : value;
}

function getSearchScore(note: IndexNote, query: string): number {
	const title = normalizeSearchText(note.title);
	if (title === query) return 1000;
	if (title.startsWith(query)) return 700;
	if (title.includes(query)) return 500;
	const basename = normalizeSearchText(note.entry.file.basename);
	if (basename.startsWith(query)) return 350;
	return 100;
}

function normalizeSearchText(value: string): string {
	return value.trim().toLocaleLowerCase('zh-CN');
}

function uniqueTexts(values: readonly string[]): string[] {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
