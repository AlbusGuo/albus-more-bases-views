import { ListValue, NullValue, type Value } from 'obsidian';
import { resolveImageSource, resolveRenderedImageSource } from '../../ui/image-source';
import type { CardGalleryCardContext } from '../shared/card-gallery-view';
import { readMinionData, type MinionData } from './hearthstone-model';
import { MINION_FIELDS, type HearthstoneOptions, type MinionField } from './hearthstone-options';

type HearthstoneEntryContext = CardGalleryCardContext<HearthstoneOptions>;

export function readHearthstoneEntryInput(context: HearthstoneEntryContext): Record<string, unknown> {
	return Object.fromEntries(MINION_FIELDS.map(([field]) => [field, unwrap(getHearthstoneEntryValue(context, field))]));
}

export function readHearthstoneEntryData(
	context: HearthstoneEntryContext,
	input = readHearthstoneEntryInput(context),
): MinionData {
	return readMinionData(input, context.options.properties.title ? undefined : context.entry.file.basename);
}

function getHearthstoneEntryValue(
	context: HearthstoneEntryContext,
	field: MinionField,
): Value | null {
	const property = context.options.properties[field];
	return property ? context.entry.getValue(property) : null;
}

export function resolveHearthstoneEntryImages(
	context: HearthstoneEntryContext,
	ownerDocument: Document,
	field: 'artwork',
): string[] {
	return imageValues(getHearthstoneEntryValue(context, field))
		.map(value => resolveHearthstoneEntryImage(context, ownerDocument, value));
}

function resolveHearthstoneEntryImage(
	context: HearthstoneEntryContext,
	ownerDocument: Document,
	value: Value,
): string {
	if (value instanceof NullValue || !value.toString().trim()) return '';
	return resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, ownerDocument) ?? '';
}

function unwrap(value: Value | null): unknown {
	if (!value || value instanceof NullValue) return null;
	if (value instanceof ListValue) {
		return Array.from({ length: value.length() }, (_, index) => unwrap(value.get(index)));
	}
	return value.toString();
}

function imageValues(value: Value | null): Value[] {
	if (!value || value instanceof NullValue) return [];
	return value instanceof ListValue
		? Array.from({ length: value.length() }, (_, index) => value.get(index))
		: [value];
}
