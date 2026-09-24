import { AbstractInputSuggest, type App, type TFile } from 'obsidian';

export class VaultMarkdownSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, input: HTMLInputElement, private readonly files: readonly TFile[],
		private readonly onChoose: (link: string) => void) {
		super(app, input); this.limit = 50;
	}
	protected getSuggestions(query: string): TFile[] {
		const terms = query.toLowerCase().replace(/^\[\[/u, '').replace(/\]\]$/u, '')
			.split(/\s+/u).filter(Boolean);
		return this.files.filter(file => terms.every(term => file.path.toLowerCase().includes(term)))
			.slice(0, this.limit);
	}
	renderSuggestion(file: TFile, element: HTMLElement): void { element.setText(file.path); }
	selectSuggestion(file: TFile): void {
		const link = `[[${file.path}]]`; this.setValue(link); this.onChoose(link); this.close();
	}
}
