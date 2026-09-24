// PSD PostScript names and their installed font-family aliases, with local fallbacks.
export const HEARTHSTONE_FONTS = {
	title: '"AR LisuGB", "GBJenLei-Medium", "Microsoft YaHei", sans-serif',
	description: '"BlizzardGlobal", "BlizzardGlobal-Regular", "Microsoft YaHei", sans-serif',
	number: '"BelweBT-Bold", "Belwe Bd BT", "AR LisuGB", Georgia, serif',
	skillTitle: '"GBJenLei-Medium", "AR LisuGB", "Microsoft YaHei", sans-serif',
	skillDescription: '"BlizzardGlobal-Regular", "BlizzardGlobal", "Microsoft YaHei", sans-serif',
} as const;

const ready = new WeakMap<Document, Promise<void>>();
export function prepareHearthstoneFonts(document: Document): Promise<void> {
	let pending = ready.get(document);
	if (!pending) {
		pending = Promise.all(Object.values(HEARTHSTONE_FONTS).map(font => document.fonts.load(`32px ${font}`, '名称描述0123456789')))
			.then(() => undefined)
			.catch(() => undefined);
		ready.set(document, pending);
	}
	return pending;
}
