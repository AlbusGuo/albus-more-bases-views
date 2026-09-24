import { AbstractInputSuggest, type App } from 'obsidian';

export class TextValueSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly values: readonly string[],
		private readonly onChoose: (value: string) => void,
	) {
		super(app, input); this.limit = 50;
	}

	protected getSuggestions(query: string): string[] {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) return this.values.slice(0, this.limit);
		return this.values
			.filter(value => value.toLocaleLowerCase().includes(normalized))
			.slice(0, this.limit);
	}

	renderSuggestion(value: string, element: HTMLElement): void { element.setText(value); }

	selectSuggestion(value: string): void {
		this.setValue(value); this.onChoose(value); this.close();
	}
}
