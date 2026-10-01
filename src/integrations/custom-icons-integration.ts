import type { App } from 'obsidian';
import type {
	AlbusCustomIconsApi,
	AlbusCustomIconsPluginInstance,
	OpenIconPickerOptions,
} from './custom-icons-api';

const CUSTOM_ICONS_PLUGIN_ID = 'albus-custom-icons';

interface AppWithPlugins extends App {
	plugins?: { getPlugin(id: string): unknown };
}

export type CustomIconPickerResult =
	| { handled: false }
	| { handled: true; icon: string | null };

export class CustomIconsIntegration {
	private api: AlbusCustomIconsApi | null = null;
	private unsubscribe: (() => void) | null = null;
	private lastSyncedSignature: string | null = null;
	private pendingIconIds: string[] | null = null;
	private syncTail: Promise<void> = Promise.resolve();
	private destroyed = false;

	constructor(
		private readonly app: App,
		private readonly consumerId: string,
		private readonly onIconsChanged: () => void,
	) {}

	async openIconPicker(
		sourceEl: HTMLElement,
		initialIcon: string,
	): Promise<CustomIconPickerResult> {
		if (this.destroyed) return { handled: false };
		const api = await this.getReadyApi();
		if (!api) return { handled: false };
		const options: OpenIconPickerOptions = { sourceEl };
		if (initialIcon) {
			options.initialSelection = {
				icon: initialIcon,
				type: initialIcon.startsWith('CI-') ? 'svg' : 'lucide',
			};
		}
		const selection = await api.openIconPicker(this.consumerId, options);
		return { handled: true, icon: selection?.icon ?? null };
	}

	renderIcon(element: HTMLElement, iconId: string): boolean {
		if (this.destroyed) return false;
		const api = this.getCurrentApi();
		if (!api?.isReady) {
			if (!api) this.releaseApi();
			return false;
		}
		try {
			this.adoptApi(api);
			return api.renderIcon(element, iconId);
		} catch {
			return false;
		}
	}

	syncRequiredIcons(iconIds: readonly string[]): Promise<void> {
		if (this.destroyed) return Promise.resolve();
		this.pendingIconIds = [...new Set(
			iconIds.map((iconId) => iconId.trim()).filter(Boolean),
		)].sort();
		const operation = this.syncTail.then(
			() => this.flushRequiredIcons(),
			() => this.flushRequiredIcons(),
		);
		this.syncTail = operation.catch(() => undefined);
		return operation;
	}

	destroy(): void {
		this.destroyed = true;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.api = null;
		this.pendingIconIds = null;
		this.lastSyncedSignature = null;
	}

	private async flushRequiredIcons(): Promise<void> {
		const iconIds = this.pendingIconIds;
		this.pendingIconIds = null;
		if (!iconIds) return;
		const api = await this.getReadyApi();
		if (!api) return;
		const signature = iconIds.join('\0');
		if (signature === this.lastSyncedSignature) return;
		await api.requireIcons(this.consumerId, iconIds);
		this.lastSyncedSignature = signature;
	}

	private async getReadyApi(): Promise<AlbusCustomIconsApi | null> {
		const api = this.getCurrentApi();
		if (!api) {
			this.releaseApi();
			return null;
		}
		this.adoptApi(api);
		await api.whenReady();
		return this.destroyed ? null : api;
	}

	private getCurrentApi(): AlbusCustomIconsApi | null {
		try {
			const plugin = (this.app as AppWithPlugins).plugins?.getPlugin(
				CUSTOM_ICONS_PLUGIN_ID,
			) as AlbusCustomIconsPluginInstance | null;
			const api = plugin?.api;
			return api &&
				typeof api.whenReady === 'function' &&
				typeof api.renderIcon === 'function' &&
				typeof api.requireIcons === 'function' &&
				typeof api.openIconPicker === 'function' &&
				typeof api.onIconsChanged === 'function'
				? api
				: null;
		} catch {
			return null;
		}
	}

	private adoptApi(api: AlbusCustomIconsApi): void {
		if (this.destroyed || this.api === api) return;
		this.unsubscribe?.();
		this.api = api;
		this.lastSyncedSignature = null;
		this.unsubscribe = api.onIconsChanged(this.onIconsChanged);
	}

	private releaseApi(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.api = null;
		this.lastSyncedSignature = null;
	}
}
