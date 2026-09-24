import type { ProjectMetricKey } from './project-options';

export function normalizeRepositoryPath(value: string): string {
	const normalized = value
		.trim()
		.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
		.replace(/^github\.com\//i, '')
		.replace(/\.git$/i, '')
		.replace(/^\/+|\/+$/g, '');
	const parts = normalized.split('/').filter(Boolean);
	if (parts.length < 2) return '';
	return `${parts[0]}/${parts[1]}`;
}

export function getGithubUrl(repositoryPath: string): string {
	return `https://github.com/${repositoryPath}`;
}

export function getDevelopmentBadgeUrl(complete: boolean): string {
	return getLocalBadgeUrl(
		'Status',
		complete ? '阶段完成' : '开发中',
		complete ? '#4c1' : '#fe7d37',
		42,
		complete ? 58 : 47,
	);
}

export function getPublicBadgeUrl(isPublic: boolean): string {
	return getLocalBadgeUrl(
		'Public',
		isPublic ? '公开' : '私有',
		isPublic ? '#4c1' : '#e05d44',
		40,
		35,
	);
}

function getLocalBadgeUrl(
	label: string,
	value: string,
	color: string,
	labelWidth: number,
	valueWidth: number,
): string {
	const width = labelWidth + valueWidth;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text><text x="${labelWidth / 2}" y="14">${label}</text><text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text><text x="${labelWidth + valueWidth / 2}" y="14">${value}</text></g></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getBadgeUrl(
	repositoryPath: string,
	type: Exclude<ProjectMetricKey, 'author'>,
): string {
	const [owner, repository] = repositoryPath.split('/');
	if (!owner || !repository) return '';
	const path = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
	const base = 'https://img.shields.io/github';
	const routes: Record<Exclude<ProjectMetricKey, 'author'>, string> = {
		version: `v/release/${path}?style=flat&label=Version`,
		stars: `stars/${path}?style=flat&label=Stars`,
		downloads: `downloads/${path}/total?style=flat&label=Downloads`,
		'latest-downloads': `downloads/${path}/latest/total?style=flat&label=Latest%20Downloads`,
		forks: `forks/${path}?style=flat&label=Forks`,
		watchers: `watchers/${path}?style=flat&label=Watchers`,
		contributors: `contributors/${path}?style=flat&label=Contributors`,
		issues: `issues/${path}?style=flat&label=Issues`,
		prs: `issues-pr/${path}?style=flat&label=Open%20PRs`,
		license: `license/${path}?style=flat&label=License`,
		language: `languages/top/${path}?style=flat`,
		size: `repo-size/${path}?style=flat&label=Size`,
		'release-date': `release-date/${path}?style=flat&label=Release`,
		'last-commit': `last-commit/${path}?style=flat&label=Last%20Commit`,
	};
	return `${base}/${routes[type]}`;
}
