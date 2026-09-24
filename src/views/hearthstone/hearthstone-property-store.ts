import { parsePropertyId, type App, type TFile } from 'obsidian';
import type { HearthstoneOptions, MinionField } from './hearthstone-options';

export function writableHearthstoneProperty(options: HearthstoneOptions, field: MinionField): string | null {
	const id = options.properties[field];
	if (!id) return null;
	const parsed = parsePropertyId(id);
	return parsed.type === 'note' ? parsed.name : null;
}

/** Compare every edited value inside one atomic frontmatter transaction. */
export async function saveHearthstoneProperties(
	app: App, file: TFile, changes: ReadonlyMap<string, { before: unknown; after: unknown }>,
): Promise<void> {
	const current = app.vault.getFileByPath(file.path);
	if (!current || current !== file) throw new Error('笔记已移动或删除.');
	await app.fileManager.processFrontMatter(current, (frontmatter) => {
		const record = frontmatter as Record<string, unknown>;
		for (const [key, change] of changes) {
			if (JSON.stringify(record[key]) !== JSON.stringify(change.before)) throw new Error(`${key} 已发生变化, 请重新打开编辑器.`);
		}
		for (const [key, change] of changes) {
			if (change.after === undefined) delete record[key];
			else record[key] = change.after;
		}
	});
}
