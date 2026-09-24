import { Notice, Plugin } from 'obsidian';
import { BasesViewTabsService } from './services/bases-view-tabs';
import { CardGalleryHtmlExporter } from './services/card-gallery-html-exporter';
import { MarkdownNavigationService } from './services/markdown-navigation';
import { TablePropertyManagerService } from './services/table-property-manager';
import { ViewPackManager } from './services/view-pack-manager';
import {
	BOOK_VIEW_TYPE,
	BookView,
	getBookViewOptions,
} from './views/book/book-view';
import {
	PAPER_VIEW_TYPE,
	PaperView,
	getPaperViewOptions,
} from './views/paper/paper-view';
import {
	PROJECT_VIEW_TYPE,
	ProjectView,
	getProjectViewOptions,
} from './views/project/project-view';
import {
	COURSE_VIEW_TYPE,
	CourseView,
	getCourseViewOptions,
} from './views/course/course-view';
import {
	MEDIA_VIEW_TYPE,
	MediaView,
	getMediaViewOptions,
} from './views/media/media-view';
import {
	MOVIE_VIEW_TYPE,
	MovieView,
	getMovieViewOptions,
} from './views/movie/movie-view';
import {
	GAME_VIEW_TYPE,
	GameView,
	getGameViewOptions,
} from './views/game/game-view';
import {
	CARD_VIEW_TYPE,
	CardView,
	getCardViewOptions,
} from './views/card/card-view';
import {
	OPERATOR_VIEW_TYPE,
	OperatorView,
	getOperatorViewOptions,
} from './views/operator/operator-view';
import { OperatorAssetService } from './views/operator/operator-assets';
import {
	HEARTHSTONE_VIEW_TYPE,
	HearthstoneView,
	getHearthstoneViewOptions,
} from './views/hearthstone/hearthstone-view';
import {
	MAP_VIEW_TYPE,
	MapView,
	getMapViewOptions,
} from './views/map/map-view';
import {
	CELEBRITY_VIEW_TYPE,
	CelebrityView,
	getCelebrityViewOptions,
} from './views/celebrity/celebrity-view';
import {
	TIER_VIEW_TYPE,
	TierView,
	getTierViewOptions,
} from './views/tier/tier-view';
import {
	INDEX_VIEW_TYPE,
	IndexView,
	getIndexViewOptions,
} from './views/index/index-view';
export default class MoreBasesViewsPlugin extends Plugin {
	onload(): void {
		const navigation = new MarkdownNavigationService(this.app);
		this.register(() => navigation.destroy());
		const operatorAssets = new OperatorAssetService();
		this.register(() => operatorAssets.destroy());
		const viewTabs = new BasesViewTabsService(this.app);
		viewTabs.start();
		this.register(() => viewTabs.destroy());
		const tablePropertyManager = new TablePropertyManagerService(this.app);
		tablePropertyManager.start();
		this.register(() => tablePropertyManager.destroy());
		const htmlExporter = new CardGalleryHtmlExporter(this.app, async () => {
			if (!this.manifest.dir) return '';
			return await this.app.vault.adapter.read(`${this.manifest.dir}/styles.css`);
		});
		const viewPacks = new ViewPackManager(
			this.app,
			this.manifest.dir,
			this.manifest.version,
		);
		this.register(() => viewPacks.destroy());

		const registrations = [
			this.registerBasesView(BOOK_VIEW_TYPE, {
				name: '书籍',
				icon: 'lucide-library',
				factory: (controller, containerEl) =>
					new BookView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getBookViewOptions,
			}),
			this.registerBasesView(PAPER_VIEW_TYPE, {
				name: '论文',
				icon: 'lucide-newspaper',
				factory: (controller, containerEl) =>
					new PaperView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getPaperViewOptions,
			}),
			this.registerBasesView(PROJECT_VIEW_TYPE, {
				name: '项目',
				icon: 'lucide-github',
				factory: (controller, containerEl) =>
					new ProjectView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getProjectViewOptions,
			}),
			this.registerBasesView(COURSE_VIEW_TYPE, {
				name: '课程',
				icon: 'lucide-school',
				factory: (controller, containerEl) =>
					new CourseView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getCourseViewOptions,
			}),
			this.registerBasesView(MEDIA_VIEW_TYPE, {
				name: '影视',
				icon: 'lucide-clapperboard',
				factory: (controller, containerEl) =>
					new MediaView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getMediaViewOptions,
			}),
			this.registerBasesView(MOVIE_VIEW_TYPE, {
				name: '电影',
				icon: 'lucide-film',
				factory: (controller, containerEl) =>
					new MovieView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getMovieViewOptions,
			}),
			this.registerBasesView(GAME_VIEW_TYPE, {
				name: '游戏',
				icon: 'lucide-gamepad-2',
				factory: (controller, containerEl) =>
					new GameView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getGameViewOptions,
			}),
			this.registerBasesView(CARD_VIEW_TYPE, {
				name: '卡牌',
				icon: 'lucide-gallery-vertical-end',
				factory: (controller, containerEl) =>
					new CardView(
						controller,
						containerEl,
						navigation,
						viewTabs,
						htmlExporter,
						viewPacks,
					),
				options: getCardViewOptions,
			}),
			this.registerBasesView(OPERATOR_VIEW_TYPE, {
				name: '干员',
				icon: 'lucide-shield',
				factory: (controller, containerEl) =>
					new OperatorView(
						controller,
						containerEl,
						navigation,
						viewTabs,
						htmlExporter,
						operatorAssets,
						viewPacks,
					),
				options: getOperatorViewOptions,
			}),
			this.registerBasesView(HEARTHSTONE_VIEW_TYPE, {
				name: '炉石',
				icon: 'lucide-flame',
				factory: (controller, containerEl) =>
					new HearthstoneView(
						controller,
						containerEl,
						navigation,
						viewTabs,
						htmlExporter,
						viewPacks,
					),
				options: getHearthstoneViewOptions,
			}),
			this.registerBasesView(MAP_VIEW_TYPE, {
				name: '地图',
				icon: 'lucide-map',
				factory: (controller, containerEl) =>
					new MapView(controller, containerEl, navigation, viewTabs),
				options: getMapViewOptions,
			}),
			this.registerBasesView(CELEBRITY_VIEW_TYPE, {
				name: '名人',
				icon: 'lucide-star',
				factory: (controller, containerEl) =>
					new CelebrityView(controller, containerEl, navigation, viewTabs, htmlExporter),
				options: getCelebrityViewOptions,
			}),
			this.registerBasesView(TIER_VIEW_TYPE, {
				name: '评价',
				icon: 'lucide-trophy',
				factory: (controller, containerEl) =>
					new TierView(controller, containerEl, navigation, viewTabs),
				options: getTierViewOptions,
			}),
			this.registerBasesView(INDEX_VIEW_TYPE, {
				name: '索引',
				icon: 'lucide-notebook-tabs',
				factory: (controller, containerEl) =>
					new IndexView(controller, containerEl, navigation, viewTabs),
				options: getIndexViewOptions,
			}),
		];

		if (registrations.some((registered) => !registered)) {
			new Notice('请先启用数据库核心插件, 然后重新启用本插件.');
		}
	}
}
