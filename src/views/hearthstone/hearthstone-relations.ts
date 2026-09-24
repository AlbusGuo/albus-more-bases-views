import {
	ListValue,
	normalizePath,
	TFile,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { ViewportGridGroup } from '../../ui/viewport-grid';

interface HearthstoneRelationResult {
	groups: readonly ViewportGridGroup<BasesEntry>[];
	relatedByParent: ReadonlyMap<string, readonly BasesEntry[]>;
	childPaths: ReadonlySet<string>;
}

export function buildHearthstoneRelations(
	app: App,
	groups: readonly ViewportGridGroup<BasesEntry>[],
	parentProperty: BasesPropertyId | null,
): HearthstoneRelationResult {
	if (!parentProperty) return { groups, relatedByParent: new Map(), childPaths: new Set() };
	const entries = new Map<string, BasesEntry>();
	const orderedEntries: BasesEntry[] = [];
	for (const group of groups) for (const entry of group.items) {
		entries.set(entry.file.path, entry);
		orderedEntries.push(entry);
	}
	const directParents = new Map<string, string>();
	for (const entry of orderedEntries) {
		const parent = resolveHearthstoneLinkedFile(app, entry.getValue(parentProperty), entry.file);
		if (parent && parent.path !== entry.file.path && entries.has(parent.path)) {
			directParents.set(entry.file.path, parent.path);
		}
	}
	const hidden = new Set<string>();
	const relatedByParent = new Map<string, BasesEntry[]>();
	for (const entry of orderedEntries) {
		if (!directParents.has(entry.file.path)) continue;
		const parentPath = findRootParent(entry.file.path, directParents);
		if (!parentPath || parentPath === entry.file.path) continue;
		hidden.add(entry.file.path);
		const related = relatedByParent.get(parentPath) ?? [];
		related.push(entry);
		relatedByParent.set(parentPath, related);
	}
	return {
		groups: groups
			.map(group => ({ ...group, items: group.items.filter(entry => !hidden.has(entry.file.path)) }))
			.filter(group => group.items.length > 0),
		relatedByParent,
		childPaths: hidden,
	};
}

function findRootParent(path: string, parents: ReadonlyMap<string, string>): string | null {
	const visited = new Set([path]);
	let current = path;
	while (true) {
		const parent = parents.get(current);
		if (!parent) return current;
		if (visited.has(parent)) return null;
		visited.add(parent);
		current = parent;
	}
}

export function resolveHearthstoneLinkedFile(
	app: App,
	value: Value | string | null,
	sourceFile: TFile,
): TFile | null {
	for (const candidate of linkCandidates(value)) {
		const path = cleanLinkPath(candidate);
		if (!path) continue;
		const linked = app.metadataCache.getFirstLinkpathDest(path, sourceFile.path);
		const direct = app.vault.getFileByPath(normalizePath(path));
		const file = linked ?? direct;
		if (file instanceof TFile) return file;
	}
	return null;
}

function linkCandidates(value: Value | string | null): string[] {
	if (!value) return [];
	if (value instanceof ListValue) {
		return Array.from({ length: value.length() }, (_, index) => linkCandidates(value.get(index))).flat();
	}
	const text = typeof value === 'string' ? value.trim() : value.toString().trim();
	if (!text) return [];
	const wiki = text.match(/!?\[\[([^\]]+)\]\]/u)?.[1];
	if (wiki) return [wiki];
	const markdown = text.match(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))/u);
	return [markdown?.[1] ?? markdown?.[2] ?? text];
}

function cleanLinkPath(value: string): string {
	let path = value.trim();
	const alias = path.indexOf('|');
	if (alias >= 0) path = path.slice(0, alias);
	const subpath = path.indexOf('#');
	if (subpath >= 0) path = path.slice(0, subpath);
	return path.trim();
}
