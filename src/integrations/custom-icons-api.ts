export type PublicIconType = 'lucide' | 'svg';

export interface PublicIconSelection {
	icon: string;
	type: PublicIconType;
}

export interface OpenIconPickerOptions {
	sourceEl?: HTMLElement;
	initialSelection?: PublicIconSelection;
	initialIcon?: string;
	initialType?: PublicIconType;
}

export interface RequireIconsResult {
	ready: string[];
	missing: string[];
}

export interface AlbusCustomIconsApi {
	readonly apiVersion: string;
	readonly isReady: boolean;
	whenReady(): Promise<void>;
	hasIcon(iconId: string, type?: PublicIconType): boolean;
	renderIcon(element: HTMLElement, iconId: string, type?: PublicIconType): boolean;
	requireIcons(consumerId: string, iconIds: string[]): Promise<RequireIconsResult>;
	openIconPicker(
		consumerId: string,
		options?: OpenIconPickerOptions,
	): Promise<PublicIconSelection | null>;
	onIconsChanged(callback: () => void): () => void;
}

export interface AlbusCustomIconsPluginInstance {
	readonly api: AlbusCustomIconsApi;
}
