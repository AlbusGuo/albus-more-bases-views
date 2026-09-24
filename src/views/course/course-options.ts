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

export interface CourseViewOptions {
	cardMinWidth: number;
	coverProperty: BasesPropertyId | null;
	scoreProperty: BasesPropertyId | null;
	maxScore: number;
	markdownOpenMode: MarkdownOpenMode;
}

export function getCourseViewOptions(
	config: BasesViewConfig,
): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('课程最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				{
					type: 'property',
					key: 'coverProperty',
					displayName: '照片属性',
					placeholder: '选择照片属性',
				},
				{
					type: 'property',
					key: 'scoreProperty',
					displayName: '分数属性',
					placeholder: '选择分数属性',
				},
				{
					type: 'slider',
					key: 'maxScore',
					displayName: '满分',
					default: 100,
					min: 0,
					max: 1000,
					step: 1,
					instant: false,
					shouldHide: () => config.getAsPropertyId('scoreProperty') === null,
				},
			],
		},
	];
}

export function readCourseViewOptions(
	config: BasesViewConfig,
): CourseViewOptions {
	const maxScore = Number(config.get('maxScore'));
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		coverProperty: config.getAsPropertyId('coverProperty'),
		scoreProperty: config.getAsPropertyId('scoreProperty'),
		maxScore: Number.isFinite(maxScore)
			? Math.min(1000, Math.max(0, maxScore))
			: 100,
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}
