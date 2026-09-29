import { ListValue, StringValue, type Value } from 'obsidian';
import type { getEditablePropertyType } from './property-editing';
import type {
	CardPropertyEditorField,
	CardPropertyFieldKind,
} from './card-property-editor-types';

export type CardPropertyDraftValue = string | boolean | string[];

export function createDraftValue(
	kind: CardPropertyFieldKind,
	value: unknown,
): CardPropertyDraftValue {
	if (kind === 'boolean') return readBoolean(value);
	if (kind === 'list') {
		const values = Array.isArray(value) ? value : value === undefined || value === null
			? []
			: [value];
		return values.map(valueText).filter(Boolean);
	}
	return valueText(value);
}

export function formatInputValue(
	kind: CardPropertyFieldKind,
	value: CardPropertyDraftValue | undefined,
): string {
	const text = String(value ?? '');
	if (kind === 'date') return text.match(/^\d{4}-\d{2}-\d{2}/u)?.[0] ?? '';
	if (kind === 'datetime') {
		return text.replace(' ', 'T').replace(/Z$/u, '').match(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/u,
		)?.[0] ?? '';
	}
	return text;
}

export function resolveCardPropertyKind<Options>(
	field: CardPropertyEditorField<Options>,
	value: unknown,
	propertyType: ReturnType<typeof getEditablePropertyType>,
): CardPropertyFieldKind {
	if (propertyType === 'list') return 'list';
	if (propertyType === 'boolean') return 'boolean';
	if (propertyType === 'number') return 'number';
	if (propertyType === 'date') return 'date';
	if (propertyType === 'datetime') return 'datetime';
	if (propertyType === 'text') {
		return field.kind === 'image' || field.kind === 'pdf' ||
			field.kind === 'reading-status'
			? field.kind
			: 'text';
	}
	if (Array.isArray(value) || field.kind === 'list') return 'list';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'number') return 'number';
	if (
		field.kind !== 'image' && field.kind !== 'reading-status' &&
		typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/u.test(value)
	) return 'date';
	return field.kind ?? 'text';
}

export function readReadingStatus(value: unknown): '已阅' | '阅读中' | '未读' {
	const text = valueText(value).trim();
	if (text === '已阅' || text === '阅读中') return text;
	if (readBoolean(value)) return '已阅';
	return '未读';
}

export function supportsValueSuggestions(kind: CardPropertyFieldKind): boolean {
	return kind === 'text' || kind === 'number';
}

export function fieldDescription<Options>(
	field: CardPropertyEditorField<Options>,
	kind: CardPropertyFieldKind,
): string {
	if (field.filenameFallback) return '文件名或映射属性';
	if (kind === 'image') return '图片双链';
	if (kind === 'pdf') return 'PDF 双链';
	if (kind === 'list') return '列表';
	if (kind === 'number') return '数字';
	if (kind === 'date') return '日期';
	if (kind === 'datetime') return '日期时间';
	if (kind === 'boolean') return '开关';
	if (kind === 'reading-status') return '已阅 / 阅读中 / 未读';
	return '文本';
}

export function toBasesValue(value: unknown): Value | null {
	if (value === undefined || value === null) return null;
	if (Array.isArray(value)) {
		return new ListValue(value.map((item) => new StringValue(valueText(item))));
	}
	return new StringValue(valueText(value));
}

function readBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	const normalized = valueText(value).toLowerCase();
	return ['true', 'yes', 'x', '- [x]', 'done', '1'].includes(normalized);
}

function valueText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
	if (
		typeof value === 'string' || typeof value === 'number' ||
		typeof value === 'boolean' || typeof value === 'bigint'
	) return String(value).trim();
	return '';
}
