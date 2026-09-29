import { type App, type TFile } from 'obsidian';
import type { HearthstoneOptions, MinionField } from './hearthstone-options';
import {
	savePropertyChanges,
	writablePropertyName,
} from '../shared/property-editing';

export function writableHearthstoneProperty(options: HearthstoneOptions, field: MinionField): string | null {
	return writablePropertyName(options.properties[field]);
}

/** Compare every edited value inside one atomic frontmatter transaction. */
export async function saveHearthstoneProperties(
	app: App, file: TFile, changes: ReadonlyMap<string, { before: unknown; after: unknown }>,
): Promise<void> {
	await savePropertyChanges(app, file, changes);
}
