import { Notice, setIcon, type App } from 'obsidian';
import { CustomIconsIntegration } from '../integrations/custom-icons-integration';
import { IconSuggestModal } from '../ui/icon-suggest-modal';

export class IconService {
	private readonly customIcons: CustomIconsIntegration;
	private readonly requirements = new Map<object, readonly string[]>();
	private readonly listeners = new Set<() => void>();
	private requiredSignature = '';
	private destroyed = false;

	constructor(
		private readonly app: App,
		consumerId: string,
	) {
		this.customIcons = new CustomIconsIntegration(
			app,
			consumerId,
			() => this.notifyListeners(),
		);
	}

	render(element: HTMLElement, iconName: string, fallbackIcon = ''): boolean {
		element.empty();
		if (iconName && this.customIcons.renderIcon(element, iconName)) return true;
		try {
			const icon = iconName || fallbackIcon;
			if (icon) setIcon(element, icon);
			if (element.querySelector('svg')) return true;
		} catch {
			// Invalid or unavailable icons fall through to the fallback.
		}
		element.empty();
		if (!fallbackIcon) return false;
		setIcon(element, fallbackIcon);
		return element.querySelector('svg') !== null;
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

	setRequiredIcons(owner: object, iconIds: readonly string[]): void {
		if (this.destroyed) return;
		this.requirements.set(owner, normalizeIconIds(iconIds));
		this.syncRequiredIcons();
	}

	release(owner: object): void {
		if (!this.requirements.delete(owner) || this.destroyed) return;
		this.syncRequiredIcons();
	}

	onChanged(callback: () => void): () => void {
		if (this.destroyed) return () => undefined;
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.requirements.clear();
		this.listeners.clear();
		this.customIcons.destroy();
	}

	private syncRequiredIcons(): void {
		const iconIds = normalizeIconIds(
			[...this.requirements.values()].flatMap((values) => [...values]),
		);
		const signature = iconIds.join('\0');
		if (signature === this.requiredSignature) return;
		this.requiredSignature = signature;
		void this.customIcons.syncRequiredIcons(iconIds).then(
			() => this.notifyListeners(),
			(error: unknown) => {
				console.error('More Bases Views failed to sync Custom Icons:', error);
			},
		);
	}

	private notifyListeners(): void {
		if (this.destroyed) return;
		for (const listener of this.listeners) listener();
	}
}

function normalizeIconIds(iconIds: readonly string[]): string[] {
	return [...new Set(
		iconIds.map((iconId) => iconId.trim()).filter(Boolean),
	)].sort((left, right) => left.localeCompare(right));
}
