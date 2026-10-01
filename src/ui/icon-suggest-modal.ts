import { App, SuggestModal, getIconIds, setIcon } from 'obsidian';

interface IconSuggestion {
	value: string;
	label: string;
	searchText: string;
}

export class IconSuggestModal extends SuggestModal<IconSuggestion> {
	private readonly icons: IconSuggestion[];

	constructor(
		app: App,
		private readonly onChoose: (iconName: string) => void,
	) {
		super(app);
		this.icons = getIconIds().map((icon) => ({
			value: icon,
			label: icon,
			searchText: icon.toLocaleLowerCase(),
		}));
		this.setPlaceholder('搜索图标名称…');
	}

	getSuggestions(query: string): IconSuggestion[] {
		const keywords = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
		if (!keywords.length) return this.icons;
		return this.icons.filter((icon) =>
			keywords.every((keyword) => icon.searchText.includes(keyword)),
		);
	}

	renderSuggestion(icon: IconSuggestion, element: HTMLElement): void {
		element.addClass('mod-complex');
		element.createDiv({ text: icon.label });
		const previewEl = element.createDiv();
		try {
			setIcon(previewEl, icon.value);
			if (!previewEl.querySelector('svg')) setIcon(previewEl, 'help-circle');
		} catch {
			setIcon(previewEl, 'help-circle');
		}
	}

	onChooseSuggestion(icon: IconSuggestion): void {
		this.onChoose(icon.value);
	}
}
