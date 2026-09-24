import {
	getFrontMatterInfo,
	parseYaml,
	type App,
	type TFile,
} from 'obsidian';

export type FrontmatterBatchAction =
	| 'add'
	| 'update'
	| 'remove'
	| 'replace'
	| 'rename';

export type FrontmatterValueType =
	| 'text'
	| 'multitext'
	| 'number'
	| 'checkbox'
	| 'date'
	| 'datetime';

export type FrontmatterBatchOperation =
	| {
		action: 'add' | 'update';
		property: string;
		value: string;
		valueType: FrontmatterValueType;
		propertyType?: FrontmatterValueType;
	}
	| { action: 'remove'; property: string }
	| { action: 'replace'; property: string; oldValue: string; value: string }
	| {
		action: 'rename';
		property: string;
		newProperty: string;
		valueType: FrontmatterValueType | null;
		propertyType?: FrontmatterValueType;
	};

export interface FrontmatterPlannedChange {
	file: TFile;
	filePath: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	beforeSignature: string;
	afterSignature: string;
	description: string;
}

export interface FrontmatterBatchPlan {
	operation: FrontmatterBatchOperation;
	totalFiles: number;
	scopeSignature: string;
	changes: FrontmatterPlannedChange[];
	matchedProperties: number;
	skipped: number;
	conflicts: Array<{ file: TFile; reason: string }>;
	typeConflicts: Array<{ file: TFile; reason: string }>;
}

export interface FrontmatterBatchResult {
	succeeded: FrontmatterPlannedChange[];
	failed: Array<{ file: TFile; reason: string }>;
	notAttempted: number;
}

export function createFileSetSignature(files: readonly TFile[]): string {
	return files.map((file) => file.path).sort().join('\n');
}

export function validateBatchOperation(
	operation: FrontmatterBatchOperation,
): string | null {
	const property = normalizePropertyName(operation.property);
	if (operation.action === 'rename') {
		const newProperty = normalizePropertyName(operation.newProperty);
		if (!property || !newProperty) return '请填写旧属性名和新属性名.';
		const propertyError = validatePropertyName(property) ?? validatePropertyName(newProperty);
		if (propertyError) return propertyError;
		if (operation.propertyType && operation.valueType !== operation.propertyType) {
			return '目标属性类型与值转换类型不一致, 已阻止执行.';
		}
		const reservedType = getReservedPropertyValueType(newProperty);
		if (reservedType && operation.valueType !== reservedType) {
			return `${newProperty} 是 Obsidian 保留属性, 必须使用列表类型.`;
		}
		return null;
	}
	if (!property) return '请填写属性名.';
	const propertyError = validatePropertyName(property);
	if (propertyError) return propertyError;
	if (operation.action === 'add' || operation.action === 'update') {
		if (operation.propertyType && operation.valueType !== operation.propertyType) {
			return '目标属性类型与写入值类型不一致, 已阻止执行.';
		}
		const reservedType = getReservedPropertyValueType(property);
		if (reservedType && operation.valueType !== reservedType) {
			return `${property} 是 Obsidian 保留属性, 必须使用列表类型.`;
		}
		try {
			validateSafeText(operation.value, '属性值');
			parseInputValue(operation.value, operation.valueType);
		} catch (error) {
			return getErrorMessage(error);
		}
	}
	if (operation.action === 'replace' && operation.oldValue.length === 0) {
		return '请填写要替换的旧内容.';
	}
	if (operation.action === 'replace') {
		try {
			validateSafeText(operation.oldValue, '旧内容');
			validateSafeText(operation.value, '替换内容');
		} catch (error) {
			return getErrorMessage(error);
		}
	}
	return null;
}

export async function createBatchPlan(
	app: App,
	files: readonly TFile[],
	operation: FrontmatterBatchOperation,
	onProgress?: (completed: number, total: number) => void,
): Promise<FrontmatterBatchPlan> {
	const normalizedOperation = normalizeOperation(operation);
	const changes: FrontmatterPlannedChange[] = [];
	const conflicts: Array<{ file: TFile; reason: string }> = [];
	let matchedProperties = 0;
	let skipped = 0;
	for (let index = 0; index < files.length; index += 1) {
		const file = files[index];
		if (!file) continue;
		try {
			const before = await readFrontmatter(app, file);
			const outcome = applyOperation(before, normalizedOperation);
			if ('matched' in outcome && outcome.matched) matchedProperties += 1;
			if (outcome.kind === 'skip') skipped += 1;
			else if (outcome.kind === 'conflict') {
				conflicts.push({ file, reason: outcome.reason });
			} else {
				changes.push({
					file,
					filePath: file.path,
					before,
					after: outcome.after,
					beforeSignature: createFrontmatterSignature(before),
					afterSignature: createFrontmatterSignature(outcome.after),
					description: outcome.description,
				});
			}
		} catch (error) {
			conflicts.push({ file, reason: getErrorMessage(error) });
		}
		onProgress?.(index + 1, files.length);
		if ((index + 1) % 24 === 0) await yieldToMainThread();
	}
	return {
		operation: normalizedOperation,
		totalFiles: files.length,
		scopeSignature: createFileSetSignature(files),
		changes,
		matchedProperties,
		skipped,
		conflicts,
		typeConflicts: [],
	};
}

/** Obsidian 的属性类型是仓库级设置, 显式改型前必须验证整个仓库. */
export async function findVaultPropertyTypeConflicts(
	app: App,
	plan: FrontmatterBatchPlan,
	usePlannedValues: boolean,
	onProgress?: (completed: number, total: number) => void,
): Promise<Array<{ file: TFile; reason: string }>> {
	const target = getExplicitPropertyTypeTarget(plan.operation);
	if (!target) return [];
	const files = app.vault.getMarkdownFiles();
	const planned = usePlannedValues
		? new Map(plan.changes.map((change) => [change.filePath, change.after]))
		: new Map<string, Record<string, unknown>>();
	const conflicts: Array<{ file: TFile; reason: string }> = [];
	for (let index = 0; index < files.length; index += 1) {
		const file = files[index];
		if (!file) continue;
		try {
			const frontmatter = planned.get(file.path) ?? await readFrontmatter(app, file);
			const match = findPropertyMatch(frontmatter, target.property);
			if (match.duplicates.length > 0) {
				conflicts.push({
					file,
					reason: createDuplicatePropertyReason(target.property, match.duplicates),
				});
			} else if (
				match.key !== null &&
				!isValueCompatibleWithType(frontmatter[match.key], target.type)
			) {
				conflicts.push({
					file,
					reason: `${match.key} 的现有值不兼容${getValueTypeLabel(target.type)}类型`,
				});
			}
		} catch (error) {
			conflicts.push({ file, reason: `无法验证属性类型: ${getErrorMessage(error)}` });
		}
		onProgress?.(index + 1, files.length);
		if ((index + 1) % 24 === 0) await yieldToMainThread();
	}
	return conflicts;
}

export async function executeBatchPlan(
	app: App,
	plan: FrontmatterBatchPlan,
	onProgress: (completed: number, total: number) => void,
): Promise<FrontmatterBatchResult> {
	const succeeded: FrontmatterPlannedChange[] = [];
	const failed: Array<{ file: TFile; reason: string }> = [];
	for (let index = 0; index < plan.changes.length; index += 1) {
		const change = plan.changes[index];
		if (!change) continue;
		try {
			const currentFile = app.vault.getFileByPath(change.filePath);
			if (!currentFile) throw new Error('文件已被移动或删除');
			await guardedApplyFrontmatterChange(
				app,
				currentFile,
				change.beforeSignature,
				change.before,
				change.after,
				change.afterSignature,
			);
			succeeded.push(change);
		} catch (error) {
			failed.push({ file: change.file, reason: getErrorMessage(error) });
			onProgress(index + 1, plan.changes.length);
			break;
		}
		onProgress(index + 1, plan.changes.length);
		if ((index + 1) % 12 === 0) await yieldToMainThread();
	}
	return {
		succeeded,
		failed,
		notAttempted: plan.changes.length - succeeded.length - failed.length,
	};
}

/** 执行前一次性复核全部计划, 避免在发现后续文件已变化时留下前半批写入. */
export async function validateBatchPlanState(
	app: App,
	plan: FrontmatterBatchPlan,
	onProgress?: (completed: number, total: number) => void,
): Promise<Array<{ file: TFile; reason: string }>> {
	const conflicts: Array<{ file: TFile; reason: string }> = [];
	for (let index = 0; index < plan.changes.length; index += 1) {
		const change = plan.changes[index];
		if (!change) continue;
		try {
			const currentFile = app.vault.getFileByPath(change.filePath);
			if (!currentFile) throw new Error('文件已被移动或删除');
			const current = await readFrontmatter(app, currentFile);
			if (createFrontmatterSignature(current) !== change.beforeSignature) {
				throw new Error('属性已在预览后发生变化');
			}
		} catch (error) {
			conflicts.push({ file: change.file, reason: getErrorMessage(error) });
		}
		onProgress?.(index + 1, plan.changes.length);
		if ((index + 1) % 24 === 0) await yieldToMainThread();
	}
	return conflicts;
}

export function getBatchActionLabel(action: FrontmatterBatchAction): string {
	return {
		add: '添加属性',
		update: '更新属性',
		remove: '删除属性',
		replace: '替换内容',
		rename: '重命名属性',
	}[action];
}

function applyOperation(
	before: Record<string, unknown>,
	operation: FrontmatterBatchOperation,
):
	| { kind: 'change'; after: Record<string, unknown>; description: string; matched?: boolean }
	| { kind: 'skip'; matched?: boolean }
	| { kind: 'conflict'; reason: string; matched?: boolean } {
	const after = cloneFrontmatter(before);
	const source = findPropertyMatch(before, operation.property);
	if (source.duplicates.length > 0) {
		return {
			kind: 'conflict',
			reason: createDuplicatePropertyReason(operation.property, source.duplicates),
			matched: true,
		};
	}
	const property = source.key;
	switch (operation.action) {
		case 'add':
			if (property !== null) return { kind: 'skip', matched: true };
			after[operation.property] = parseInputValue(operation.value, operation.valueType);
			return { kind: 'change', after, description: `添加 ${operation.property}` };
		case 'update':
			if (property === null) return { kind: 'skip' };
			{
				const nextValue = parseInputValue(operation.value, operation.valueType);
				if (createValueSignature(before[property]) === createValueSignature(nextValue)) {
					return { kind: 'skip', matched: true };
				}
				after[property] = nextValue;
			}
			return { kind: 'change', after, description: `更新 ${property}`, matched: true };
		case 'remove':
			if (property === null) return { kind: 'skip' };
			delete after[property];
			return { kind: 'change', after, description: `删除 ${property}`, matched: true };
		case 'replace': {
			if (property === null) return { kind: 'skip' };
			const current = before[property];
			if (typeof current !== 'string') {
				return { kind: 'conflict', reason: `${property} 不是文本属性`, matched: true };
			}
			if (!current.includes(operation.oldValue)) return { kind: 'skip', matched: true };
			after[property] = current.split(operation.oldValue).join(operation.value);
			return { kind: 'change', after, description: `替换 ${property} 的文本`, matched: true };
		}
		case 'rename': {
			if (property === null) return { kind: 'skip' };
			const target = findPropertyMatch(before, operation.newProperty);
			if (target.duplicates.length > 0) {
				return {
					kind: 'conflict',
					reason: createDuplicatePropertyReason(operation.newProperty, target.duplicates),
					matched: true,
				};
			}
			const sameLogicalProperty = propertyNamesEqual(property, operation.newProperty);
			if (!sameLogicalProperty && target.key !== null) {
				return { kind: 'conflict', reason: `目标属性 ${target.key} 已存在`, matched: true };
			}
			try {
				const converted = operation.valueType
					? convertExistingValue(before[property], operation.valueType)
					: before[property];
				const spellingChanged = property !== operation.newProperty;
				const valueChanged = createValueSignature(converted) !== createValueSignature(before[property]);
				if (!spellingChanged && !valueChanged) return { kind: 'skip', matched: true };
				if (spellingChanged) delete after[property];
				after[operation.newProperty] = cloneFrontmatter(converted);
				return {
					kind: 'change',
					after,
					description: spellingChanged
						? `将 ${property} 重命名为 ${operation.newProperty}`
						: `将 ${property} 转换为 ${getValueTypeLabel(operation.valueType)}`,
					matched: true,
				};
			} catch (error) {
				return { kind: 'conflict', reason: getErrorMessage(error), matched: true };
			}
		}
	}
}

function getExplicitPropertyTypeTarget(
	operation: FrontmatterBatchOperation,
): { property: string; type: FrontmatterValueType } | null {
	if (!('propertyType' in operation) || !operation.propertyType) return null;
	const property = operation.action === 'rename'
		? operation.newProperty
		: operation.property;
	if (getReservedPropertyValueType(property)) return null;
	return { property, type: operation.propertyType };
}

function getValueTypeLabel(type: FrontmatterValueType | null): string {
	return {
		text: '文本',
		multitext: '列表',
		number: '数字',
		checkbox: '复选框',
		date: '日期',
		datetime: '日期时间',
	}[type ?? 'text'];
}

async function readFrontmatter(
	app: App,
	file: TFile,
): Promise<Record<string, unknown>> {
	const content = await app.vault.cachedRead(file);
	const info = getFrontMatterInfo(content);
	if (!info.exists || !info.frontmatter.trim()) return {};
	const parsed: unknown = parseYaml(info.frontmatter);
	if (parsed === null || parsed === undefined) return {};
	if (!isPlainObject(parsed)) throw new Error('Frontmatter 顶层不是对象');
	return cloneFrontmatter(parsed);
}

async function guardedApplyFrontmatterChange(
	app: App,
	file: TFile,
	expectedSignature: string,
	expected: Record<string, unknown>,
	next: Record<string, unknown>,
	nextSignature: string,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		const writable = frontmatter as Record<string, unknown>;
		if (createFrontmatterSignature(writable) !== expectedSignature) {
			throw new Error('属性已被其他操作修改, 已跳过以避免覆盖');
		}
		for (const key of getChangedKeys(expected, next)) {
			if (hasOwn(next, key)) writable[key] = cloneFrontmatter(next[key]);
			else delete writable[key];
		}
		if (createFrontmatterSignature(writable) !== nextSignature) {
			throw new Error('属性写入结果校验失败, 已中止当前文件');
		}
	});
	const persisted = await readFrontmatter(app, file);
	if (createFrontmatterSignature(persisted) !== nextSignature) {
		throw new Error('属性写入后的持久化校验失败, 请检查该文件');
	}
}

function normalizeOperation(
	operation: FrontmatterBatchOperation,
): FrontmatterBatchOperation {
	const property = normalizePropertyName(operation.property);
	switch (operation.action) {
		case 'add':
		case 'update':
			return {
				action: operation.action,
				property,
				value: operation.value,
				valueType: operation.valueType,
				...(operation.propertyType ? { propertyType: operation.propertyType } : {}),
			};
		case 'remove':
			return { action: 'remove', property };
		case 'replace':
			return {
				action: 'replace',
				property,
				oldValue: operation.oldValue,
				value: operation.value,
			};
		case 'rename':
			return {
				action: 'rename',
				property,
				newProperty: normalizePropertyName(operation.newProperty),
				valueType: operation.valueType,
				...(operation.propertyType ? { propertyType: operation.propertyType } : {}),
			};
	}
}

function parseInputValue(value: string, type: FrontmatterValueType): unknown {
	switch (type) {
		case 'text':
			return value;
		case 'multitext':
			return parseListInput(value);
		case 'number': {
			const normalized = value.trim();
			if (!normalized) throw new Error('数字属性不能为空.');
			const result = Number(normalized);
			if (!Number.isFinite(result)) throw new Error('请输入有效的数字.');
			return result;
		}
		case 'checkbox': {
			const normalized = value.trim().toLocaleLowerCase();
			if (['true', '1', '是', '真'].includes(normalized)) return true;
			if (['false', '0', '否', '假'].includes(normalized)) return false;
			throw new Error('复选框属性请输入 true/false, 是/否或 1/0.');
		}
		case 'date': {
			const normalized = value.trim();
			if (!isValidDate(normalized)) {
				throw new Error('请输入真实存在的日期, 格式为 YYYY-MM-DD.');
			}
			return normalized;
		}
		case 'datetime': {
			const normalized = value.trim();
			if (!isValidDateTime(normalized)) {
				throw new Error('请输入真实存在的日期时间, 格式为 YYYY-MM-DDTHH:mm 或 YYYY-MM-DDTHH:mm:ss.');
			}
			return normalized;
		}
	}
}

function parseListInput(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith('[') && !trimmed.startsWith('[[')) {
		if (!trimmed.endsWith(']')) throw new Error('列表数组缺少右方括号.');
		try {
			const parsed: unknown = parseYaml(trimmed);
			if (Array.isArray(parsed) && parsed.every(isScalarValue)) return parsed.map(String);
			throw new Error('列表数组只能包含文本, 数字或布尔值.');
		} catch (error) {
			throw new Error(`列表数组无效: ${getErrorMessage(error)}`);
		}
	}
	const result: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let escaped = false;
	let wikiDepth = 0;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index] ?? '';
		const next = value[index + 1] ?? '';
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if (quote && character === '\\') {
			current += character;
			escaped = true;
			continue;
		}
		if (character === '"' || character === "'") {
			if (quote === character) quote = null;
			else if (quote === null) quote = character;
			current += character;
			continue;
		}
		if (quote === null && character === '[' && next === '[') {
			wikiDepth += 1;
			current += '[[';
			index += 1;
			continue;
		}
		if (quote === null && character === ']' && next === ']' && wikiDepth > 0) {
			wikiDepth -= 1;
			current += ']]';
			index += 1;
			continue;
		}
		if (quote === null && wikiDepth === 0 && (character === ',' || character === '\n')) {
			pushListItem(result, current);
			current = '';
			continue;
		}
		if (character !== '\r') current += character;
	}
	if (quote !== null || wikiDepth !== 0) {
		throw new Error('列表值中存在未闭合的引号或双链.');
	}
	pushListItem(result, current);
	return result;
}

function pushListItem(result: string[], raw: string): void {
	let item = raw.trim();
	if (!item) return;
	if (
		(item.startsWith('"') && item.endsWith('"')) ||
		(item.startsWith("'") && item.endsWith("'"))
	) {
		try {
			const parsed: unknown = parseYaml(item);
			if (typeof parsed === 'string') item = parsed;
		} catch {
			// 保留无法解析的引号文本, 避免静默修改数据.
		}
	}
	result.push(item);
}

function convertExistingValue(value: unknown, type: FrontmatterValueType): unknown {
	if (value === null || value === undefined) return value;
	switch (type) {
		case 'text':
			if (typeof value === 'string') return value;
			if (Array.isArray(value) && value.every(isScalarValue)) {
				return value.map(String).join(', ');
			}
			if (isScalarValue(value)) return String(value);
			throw new Error('现有值无法安全转换为文本.');
		case 'multitext':
			if (Array.isArray(value) && value.every(isScalarValue)) return value.map(String);
			if (isScalarValue(value)) return String(value).length > 0 ? [String(value)] : [];
			throw new Error('现有值无法安全转换为列表.');
		case 'number':
			if (typeof value === 'number' && Number.isFinite(value)) return value;
			if (!isScalarValue(value)) throw new Error('现有值无法安全转换为数字.');
			return parseInputValue(String(value), 'number');
		case 'checkbox':
			if (typeof value === 'boolean') return value;
			if (!isScalarValue(value)) throw new Error('现有值无法安全转换为复选框.');
			return parseInputValue(String(value), 'checkbox');
		case 'date':
			if (!isScalarValue(value)) throw new Error('现有值无法安全转换为日期.');
			return parseInputValue(String(value), 'date');
		case 'datetime':
			if (!isScalarValue(value)) throw new Error('现有值无法安全转换为日期时间.');
			return parseInputValue(String(value), 'datetime');
	}
}

function isValueCompatibleWithType(value: unknown, type: FrontmatterValueType): boolean {
	if (value === null || value === undefined) return true;
	switch (type) {
		case 'text': return typeof value === 'string';
		case 'multitext': return Array.isArray(value) && value.every(isScalarValue);
		case 'number': return typeof value === 'number' && Number.isFinite(value);
		case 'checkbox': return typeof value === 'boolean';
		case 'date': return typeof value === 'string' && isValidDate(value);
		case 'datetime': return typeof value === 'string' && isValidDateTime(value);
	}
}

function isValidDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
	if (!match) return false;
	return isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isValidDateTime(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
	if (!match) return false;
	return isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3])) &&
		Number(match[4]) >= 0 && Number(match[4]) <= 23 &&
		Number(match[5]) >= 0 && Number(match[5]) <= 59 &&
		(match[6] === undefined || (Number(match[6]) >= 0 && Number(match[6]) <= 59));
}

function isValidDateParts(year: number, month: number, day: number): boolean {
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;
	return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isScalarValue(value: unknown): value is string | number | boolean {
	return ['string', 'number', 'boolean'].includes(typeof value);
}

function getChangedKeys(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): string[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...keys].filter((key) =>
		createValueSignature(before[key]) !== createValueSignature(after[key]) ||
		hasOwn(before, key) !== hasOwn(after, key),
	);
}

function createValueSignature(value: unknown): string {
	return JSON.stringify(stabilize(value));
}

function validateSafeText(value: string, label: string): void {
	if ([...value].some((character) => {
		const code = character.charCodeAt(0);
		return (code >= 0 && code <= 8) || code === 11 || code === 12 ||
			(code >= 14 && code <= 31) || code === 127;
	})) {
		throw new Error(`${label}不能包含不可见控制字符.`);
	}
}

function normalizePropertyName(value: string): string {
	return value.trim();
}

function validatePropertyName(value: string): string | null {
	if ([...value].some((character) => {
		const code = character.charCodeAt(0);
		return (code >= 0 && code <= 31) || code === 127;
	})) return '属性名不能包含控制字符.';
	const normalized = value.toLocaleLowerCase();
	if (['__proto__', 'prototype', 'constructor'].includes(normalized)) {
		return '该属性名存在安全风险, 请更换名称.';
	}
	if (value === '<<') return '不能使用 YAML 合并键作为属性名.';
	return null;
}

function getReservedPropertyValueType(property: string): FrontmatterValueType | null {
	return ['aliases', 'tags', 'cssclasses'].includes(property.toLocaleLowerCase())
		? 'multitext'
		: null;
}

function findPropertyMatch(
	frontmatter: Record<string, unknown>,
	property: string,
): { key: string | null; duplicates: string[] } {
	const normalized = property.toLocaleLowerCase();
	const matches = Object.keys(frontmatter).filter(
		(key) => key.toLocaleLowerCase() === normalized,
	);
	return {
		key: matches.length === 1 ? matches[0] ?? null : null,
		duplicates: matches.length > 1 ? matches : [],
	};
}

function propertyNamesEqual(left: string, right: string): boolean {
	return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function createDuplicatePropertyReason(property: string, keys: readonly string[]): string {
	return `发现仅大小写不同的重复属性 (${keys.join(', ')}), 无法安全处理 ${property}`;
}

function createFrontmatterSignature(value: Record<string, unknown>): string {
	return JSON.stringify(stabilize(value));
}

function stabilize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stabilize);
	if (!isPlainObject(value)) return value;
	const result = Object.create(null) as Record<string, unknown>;
	for (const key of Object.keys(value).sort()) result[key] = stabilize(value[key]);
	return result;
}

function cloneFrontmatter<T>(value: T): T {
	return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return '未知错误';
}

async function yieldToMainThread(): Promise<void> {
	await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
