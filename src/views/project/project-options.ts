import type {
	BasesAllOptions,
	BasesPropertyId,
	BasesViewConfig,
} from 'obsidian';
import {
	createMarkdownOpenModeOption,
	readMarkdownOpenMode,
	type MarkdownOpenMode,
} from '../../services/markdown-navigation';
import {
	createCardMinWidthOption,
	readCardMinWidth,
} from '../shared/card-sizing';

export const PROJECT_METRICS = [
	{ key: 'author', label: 'Author', option: 'showAuthor', name: '作者' },
	{ key: 'version', label: 'Version', option: 'showVersion', name: '版本' },
	{ key: 'stars', label: 'Stars', option: 'showStars', name: 'Stars' },
	{ key: 'downloads', label: 'Downloads', option: 'showDownloads', name: '总下载量' },
	{ key: 'latest-downloads', label: 'Latest', option: 'showLatestDownloads', name: '最新版本下载量' },
	{ key: 'forks', label: 'Forks', option: 'showForks', name: 'Forks' },
	{ key: 'watchers', label: 'Watchers', option: 'showWatchers', name: 'Watchers' },
	{ key: 'contributors', label: 'Contrib', option: 'showContributors', name: '贡献者' },
	{ key: 'issues', label: 'Issues', option: 'showIssues', name: 'Issues' },
	{ key: 'prs', label: 'Open PRs', option: 'showPrs', name: 'Pull requests' },
	{ key: 'license', label: 'License', option: 'showLicense', name: '许可证' },
	{ key: 'language', label: 'Language', option: 'showLanguage', name: '主要语言' },
	{ key: 'size', label: 'Size', option: 'showSize', name: '仓库大小' },
	{ key: 'release-date', label: 'Release', option: 'showReleaseDate', name: '发布日期' },
	{ key: 'last-commit', label: 'Commit', option: 'showLastCommit', name: '最近提交' },
] as const;

export type ProjectMetricKey = (typeof PROJECT_METRICS)[number]['key'];

export interface ProjectViewOptions {
	cardMinWidth: number;
	titleProperty: BasesPropertyId | null;
	authorProperty: BasesPropertyId | null;
	statusProperty: BasesPropertyId | null;
	developmentStatusProperty: BasesPropertyId | null;
	repoPathProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
	visibleMetrics: ReadonlySet<ProjectMetricKey>;
}

export function getProjectViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('项目最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '项目名称属性', '留空时使用文件名'),
				propertyOption('authorProperty', '作者属性', '选择作者属性'),
				propertyOption('repoPathProperty', '项目地址属性', '例如 owner/repository'),
				{
					...propertyOption('statusProperty', '公开状态属性', '公开项目为开启状态'),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
				{
					...propertyOption(
						'developmentStatusProperty',
						'开发状态属性',
						'阶段完成为开启状态',
					),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
			],
		},
		{
			type: 'group',
			displayName: '显示条目',
			items: PROJECT_METRICS.map((metric) => ({
				type: 'toggle' as const,
				key: metric.option,
				displayName: metric.name,
				default: true,
			})),
		},
	];
}

export function readProjectViewOptions(
	config: BasesViewConfig,
): ProjectViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		titleProperty: config.getAsPropertyId('titleProperty'),
		authorProperty: config.getAsPropertyId('authorProperty'),
		statusProperty: config.getAsPropertyId('statusProperty'),
		developmentStatusProperty: config.getAsPropertyId(
			'developmentStatusProperty',
		),
		repoPathProperty: config.getAsPropertyId('repoPathProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
		visibleMetrics: new Set(
			PROJECT_METRICS.filter((metric) => config.get(metric.option) !== false).map(
				(metric) => metric.key,
			),
		),
	};
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}
