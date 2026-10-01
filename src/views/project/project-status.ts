export const PROJECT_DEVELOPMENT_STATUSES = ['阶段完成', '开发中'] as const;
export type ProjectDevelopmentStatus =
	typeof PROJECT_DEVELOPMENT_STATUSES[number];

export const PROJECT_PUBLIC_STATUSES = ['私有', '公开', '上架'] as const;
export type ProjectPublicStatus = typeof PROJECT_PUBLIC_STATUSES[number];

export function getProjectDevelopmentStatus(
	value: unknown,
): ProjectDevelopmentStatus {
	const text = statusText(value);
	if (text === '阶段完成' || text === '开发中') return text;
	return getLegacyStatus(value) ? '阶段完成' : '开发中';
}

export function getProjectPublicStatus(
	value: unknown,
): ProjectPublicStatus {
	const text = statusText(value);
	if (text === '私有' || text === '公开' || text === '上架') {
		return text;
	}
	return getLegacyStatus(value) ? '公开' : '私有';
}

export function shouldLoadProjectBadges(status: ProjectPublicStatus): boolean {
	return status === '公开' || status === '上架';
}

function statusText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (
		typeof value === 'string' || typeof value === 'number' ||
		typeof value === 'boolean' || typeof value === 'bigint'
	) return String(value).trim();
	if (typeof value !== 'object' && typeof value !== 'function') return '';
	const stringifier: unknown = Reflect.get(value, 'toString');
	if (typeof stringifier !== 'function' || stringifier === Object.prototype.toString) {
		return '';
	}
	const result: unknown = Reflect.apply(stringifier, value, []);
	return typeof result === 'string' ? result.trim() : '';
}

function getLegacyStatus(value: unknown): boolean {
	const normalized = statusText(value).toLowerCase();
	if (['true', 'yes', 'x', '- [x]', 'done'].includes(normalized)) return true;
	return /^-?\d+(?:\.\d+)?$/u.test(normalized) && Number(normalized) !== 0;
}
