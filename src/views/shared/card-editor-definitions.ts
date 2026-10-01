import type { BookViewOptions } from '../book/book-options';
import type { CardViewOptions } from '../card/card-options';
import type { CelebrityViewOptions } from '../celebrity/celebrity-options';
import type { CourseViewOptions } from '../course/course-options';
import type { GameViewOptions } from '../game/game-options';
import type { MediaViewOptions } from '../media/media-options';
import type { PaperViewOptions } from '../paper/paper-options';
import type { ProjectViewOptions } from '../project/project-options';
import {
	getProjectDevelopmentStatus,
	getProjectPublicStatus,
	PROJECT_DEVELOPMENT_STATUSES,
	PROJECT_PUBLIC_STATUSES,
} from '../project/project-status';
import type {
	CardPropertyEditorDefinition,
	CardPropertyEditorField,
	CardPropertyFieldKind,
} from './card-property-editor-types';

export const BOOK_CARD_EDITOR: CardPropertyEditorDefinition<BookViewOptions> = {
	title: '编辑书籍',
	fields: [
		filenameField<BookViewOptions>('title', '书名'),
		propertyField('cover', '封面', 'image', (options) => options.coverProperty),
		propertyField('attachment', '附件', 'pdf', (options) => options.fileLinkProperty),
		propertyField('status', '阅读状态', 'reading-status', (options) => options.statusProperty),
	],
};

export const PAPER_CARD_EDITOR: CardPropertyEditorDefinition<PaperViewOptions> = {
	title: '编辑论文',
	fields: [
		propertyField('title', '标题', 'text', (options) => options.titleProperty, true),
		propertyField('author', '作者', 'list', (options) => options.authorProperty),
		propertyField('pageCount', '页数', 'number', (options) => options.pageCountProperty),
		propertyField('attachment', '附件', 'pdf', (options) => options.fileLinkProperty),
		propertyField('status', '阅读状态', 'reading-status', (options) => options.statusProperty),
	],
};

export const PROJECT_CARD_EDITOR: CardPropertyEditorDefinition<ProjectViewOptions> = {
	title: '编辑项目',
	fields: [
		propertyField('title', '项目名称', 'text', (options) => options.titleProperty, true),
		propertyField('author', '作者', 'list', (options) => options.authorProperty),
		propertyField('repoPath', '项目地址', 'text', (options) => options.repoPathProperty),
		{
			...propertyField('publicStatus', '公开状态', 'select', (options) => options.statusProperty),
			options: PROJECT_PUBLIC_STATUSES,
			normalize: getProjectPublicStatus,
		},
		{
			...propertyField('developmentStatus', '开发状态', 'select', (options) => options.developmentStatusProperty),
			options: PROJECT_DEVELOPMENT_STATUSES,
			normalize: getProjectDevelopmentStatus,
		},
	],
};

export const COURSE_CARD_EDITOR: CardPropertyEditorDefinition<CourseViewOptions> = {
	title: '编辑课程',
	fields: [
		filenameField<CourseViewOptions>('title', '课程名称'),
		propertyField('cover', '照片', 'image', (options) => options.coverProperty),
		propertyField('score', '分数', 'number', (options) => options.scoreProperty),
	],
};

export const MEDIA_CARD_EDITOR: CardPropertyEditorDefinition<MediaViewOptions> = {
	title: '编辑影视条目',
	fields: [
		propertyField('title', '标题', 'text', (options) => options.titleProperty, true),
		propertyField('poster', '海报', 'image', (options) => options.posterProperty),
		propertyField('episodes', '剧集数', 'number', (options) => options.episodesProperty),
		propertyField('duration', '播放时长', 'text', (options) => options.durationProperty),
		propertyField('releaseDate', '首播或上映日期', 'date', (options) => options.releaseDateProperty),
		propertyField('genre', '类型', 'list', (options) => options.genreProperty),
		propertyField('watchDate', '最后观看日期', 'date', (options) => options.watchDateProperty),
		propertyField('rating', '评分', 'number', (options) => options.ratingProperty),
	],
};

export const MOVIE_CARD_EDITOR: CardPropertyEditorDefinition<MediaViewOptions> = {
	...MEDIA_CARD_EDITOR,
	title: '编辑电影',
};

export const GAME_CARD_EDITOR: CardPropertyEditorDefinition<GameViewOptions> = {
	title: '编辑游戏',
	fields: [
		propertyField('title', '标题', 'text', (options) => options.titleProperty, true),
		propertyField('poster', '封面', 'image', (options) => options.posterProperty),
		propertyField('genre', '类型', 'list', (options) => options.genreProperty),
		propertyField('releaseDate', '发行日期', 'date', (options) => options.releaseDateProperty),
		propertyField('rating', '评分', 'number', (options) => options.ratingProperty),
	],
};

export const CARD_CARD_EDITOR: CardPropertyEditorDefinition<CardViewOptions> = {
	title: '编辑卡牌',
	fields: [
		filenameField<CardViewOptions>('title', '名称'),
		propertyField('front', '正面图片', 'image', (options) => options.frontProperty),
	],
};

export const CELEBRITY_CARD_EDITOR: CardPropertyEditorDefinition<CelebrityViewOptions> = {
	title: '编辑名人',
	fields: [
		filenameField<CelebrityViewOptions>('title', '姓名'),
		propertyField('photo', '照片', 'image', (options) => options.photoProperty),
	],
};

function filenameField<Options>(
	id: string,
	name: string,
): CardPropertyEditorField<Options> {
	return {
		id,
		name,
		description: '文件名',
		property: () => null,
		filenameFallback: true,
	};
}

function propertyField<Options>(
	id: string,
	name: string,
	kind: CardPropertyFieldKind,
	property: (options: Options) => ReturnType<CardPropertyEditorField<Options>['property']>,
	filenameFallback = false,
): CardPropertyEditorField<Options> {
	return { id, name, kind, property, filenameFallback };
}
