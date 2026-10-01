import { Notice, setIcon, type App } from 'obsidian';
import { CustomIconsIntegration } from '../integrations/custom-icons-integration';
import { IconSuggestModal } from '../ui/icon-suggest-modal';

export class BasesViewIconService {
	private readonly customIcons: CustomIconsIntegration;

	constructor(
		app: App,
		consumerId: string,
		onIconsChanged: () => void,
	) {
		this.app = app;
		this.customIcons = new CustomIconsIntegration(
			app,
			consumerId,
			onIconsChanged,
		);
	}

	private readonly app: App;

	render(element: HTMLElement, iconName: string, fallbackIcon: string): void {
		element.empty();
		if (iconName && this.customIcons.renderIcon(element, iconName)) return;
		try {
			setIcon(element, iconName || fallbackIcon);
			if (element.querySelector('svg')) return;
		} catch {
			// Fall through to the registered view icon.
		}
		element.empty();
		setIcon(element, fallbackIcon);
	}

	async pick(
		sourceEl: HTMLElement,
		initialIcon: string,
		onSelect: (iconName: string) => void,
	): Promise<void> {
		try {
			const result = await this.customIcons.openIconPicker(sourceEl, initialIcon);
			if (result.handled) {
				if (result.icon) onSelect(result.icon);
				return;
			}
		} catch (error) {
			console.error('More Bases Views failed to open Custom Icons:', error);
			new Notice('图标选择器打开失败，已使用原生选择器.');
		}
		new IconSuggestModal(this.app, onSelect).open();
	}

	sync(iconIds: readonly string[]): Promise<void> {
		return this.customIcons.syncRequiredIcons(iconIds);
	}

	destroy(): void {
		this.customIcons.destroy();
	}
}
