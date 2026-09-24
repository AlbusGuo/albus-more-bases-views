import { Notice, Setting, normalizePath, type App, type TFile } from 'obsidian';
import { ViewIsolatedModal } from '../../ui/view-isolated-modal';
import { VaultImageSuggest, listVaultImages } from '../../ui/vault-image-suggest';
import { VaultMarkdownSuggest } from '../../ui/vault-markdown-suggest';
import { TextValueSuggest } from '../../ui/text-value-suggest';
import {
	BATTLEGROUND_COST_TYPES,
	formatMinionBanner,
	formatMinionCost,
	formatMinionStats,
	HEARTHSTONE_CLASSES,
	MINION_BANNERS,
	MINION_CARD_KINDS,
	MINION_CARD_SCOPES,
	MINION_TIER_VALUES,
	MINION_FINISHES,
	MINION_RARITIES,
	RUNE_TYPES,
	TRADITIONAL_COST_TYPES,
	formatMinionCardType,
	readClasses,
	readMinionBanner,
	readMinionData,
	splitMinionCardType,
	valueText,
	type CostType,
	type HearthstoneClass,
	type MinionCardKind,
	type MinionCardScope,
	type MinionFinish,
	type MinionRarity,
	type RuneType,
} from './hearthstone-model';
import type { HearthstoneOptions, MinionField } from './hearthstone-options';
import { saveHearthstoneProperties, writableHearthstoneProperty } from './hearthstone-property-store';
import { MinionPropertyPreview } from './hearthstone-property-preview';
import type { HearthstoneAssets } from './hearthstone-template';
import { bindArtworkPointerEditor } from '../shared/artwork-pointer-editor';
import { formatArtworkPosition, parseArtworkPosition, type ArtworkPosition } from '../shared/artwork-position';
import { InlineMarkdownEditor } from '../../ui/inline-markdown-editor';

type ModalField = MinionField;

export interface HearthstoneEditorSuggestions {
	noteFiles: readonly TFile[];
	cardNumbers: readonly string[];
	expansions: readonly string[];
	tribes: readonly string[];
}

interface MinionEditorDraft {
	title: string;
	cardNumber: string;
	description: string;
	flavor: string;
	expansion: string;
	derivedParent: string;
	cardScope: MinionCardScope;
	cardKind: MinionCardKind;
	finish: MinionFinish;
	artwork: string;
	classes: [HearthstoneClass, HearthstoneClass | ''];
	rarity: MinionRarity;
	costType: CostType;
	costValue: string;
	tier: string;
	stats: string;
	tribes: [string, string];
	banner: string;
	runes: [RuneType, RuneType, RuneType];
}

const EDITABLE_FIELDS: readonly ModalField[] = [
	'title', 'cardNumber', 'description', 'flavor', 'expansion', 'derivedParent', 'cardType', 'finish', 'artwork', 'artworkPosition', 'classes',
	'rarity', 'cost', 'stats', 'tribes', 'banner',
];

export class MinionPropertyModal extends ViewIsolatedModal {
	private readonly original = new Map<string, unknown>();
	private readonly dirty = new Set<ModalField>();
	private suggestions: Array<{ close: () => void }> = [];
	private imageFiles: TFile[] = [];
	private noteFiles: TFile[] = [];
	private cardNumberValues: string[] = [];
	private expansionValues: string[] = [];
	private tribeValues: string[] = [];
	private draft!: MinionEditorDraft;
	private formEl!: HTMLElement;
	private preview!: MinionPropertyPreview;
	private artworks: string[] = [];
	private artworkPositions: ArtworkPosition[] = [];
	private artworkIndex = 0;
	private artworkInputEl: HTMLInputElement | null = null;
	private releasePositionEditor: (() => void) | null = null;
	private positionChanged = false;
	private saveTimer: number | null = null;
	private saveChain: Promise<void> = Promise.resolve();
	private closed = false;
	private descriptionEditor: InlineMarkdownEditor | null = null;

	constructor(app: App, private readonly file: TFile, private readonly options: HearthstoneOptions,
		private readonly assets: HearthstoneAssets,
		private readonly suggestionData: HearthstoneEditorSuggestions,
		private readonly onClosed?: () => void) {
		super(app);
	}

	onOpen(): void {
		this.closed = false; this.setTitle('编辑卡牌'); this.modalEl.addClass('mbv-hs-property-modal');
		this.contentEl.addClass('mbv-hs-property-editor'); this.imageFiles = listVaultImages(this.app);
		this.noteFiles = this.suggestionData.noteFiles.filter(file => file !== this.file);
		this.cardNumberValues = [...this.suggestionData.cardNumbers];
		this.expansionValues = [...this.suggestionData.expansions];
		this.tribeValues = [...this.suggestionData.tribes]; this.load();
		const previewEl = this.contentEl.createDiv('mbv-hs-property-preview');
		this.formEl = this.contentEl.createDiv({
			cls: 'mbv-hs-property-form',
			attr: { 'data-mbv-card-scroll': '' },
		});
		this.preview = new MinionPropertyPreview(
			previewEl, this.app, this.file, this.assets, this.titleFallback(),
		); this.render(); this.bindPositionEditor();
	}

	onClose(): void {
		if (this.positionChanged) this.dirty.add('artworkPosition');
		this.closed = true; this.releasePositionEditor?.(); this.releasePositionEditor = null;
		this.descriptionEditor?.destroy(); this.descriptionEditor = null;
		this.closeSuggestions(); this.preview.destroy(); this.imageFiles = []; this.noteFiles = [];
		this.cardNumberValues = []; this.expansionValues = []; this.tribeValues = []; this.contentEl.empty();
		void this.flushSave().finally(() => { this.original.clear(); this.dirty.clear(); });
		this.onClosed?.();
	}

	private load(): void {
		const source = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const raw = (field: MinionField): unknown => {
			const property = writableHearthstoneProperty(this.options, field);
			if (property && !this.original.has(property)) this.original.set(property, structuredClone(source?.[property]));
			return property ? source?.[property] : undefined;
		};
		const input = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, raw(field)]));
		this.artworks = allValues(input.artwork); if (!this.artworks.length) this.artworks = [''];
		this.artworkPositions = this.artworks.map((_, index) => parseArtworkPosition(input.artworkPosition, index));
		const data = readMinionData(input, this.titleFallback());
		const [cardScope, cardKind] = splitMinionCardType(data.cardType);
		const storedClasses = readClasses(input.classes);
		const storedBanner = readMinionBanner(input.banner);
		this.draft = {
			title: this.options.properties.title ? valueText(input.title) : this.file.basename,
			cardNumber: valueText(input.cardNumber),
			description: valueText(input.description), flavor: valueText(input.flavor),
			expansion: valueText(input.expansion), derivedParent: valueText(input.derivedParent),
			cardScope, cardKind, finish: data.finish,
			artwork: this.artworks[0] ?? '',
			classes: [storedClasses[0] ?? '中立', storedClasses[1] ?? ''],
			rarity: data.rarity,
			costType: data.costType, costValue: data.cost, tier: String(data.tier),
			stats: data.cardType.endsWith('-英雄') ? data.heroStat
				: data.cardType.endsWith('-地标') ? data.health
					: data.cardType.endsWith('-法术') ? '' : formatMinionStats(data.attack, data.health),
			tribes: [data.tribes[0] ?? '', data.tribes[1] ?? ''],
			banner: storedBanner.banner,
			runes: [storedBanner.runes[0] ?? '红', storedBanner.runes[1] ?? '红', storedBanner.runes[2] ?? '红'],
		};
	}

	private render(): void {
		const scroll = this.formEl.scrollTop;
		this.closeSuggestions(); this.descriptionEditor?.destroy(); this.descriptionEditor = null;
		this.formEl.empty();
		this.addText('title', '名称', this.options.properties.title ? '文本' : '文件名', this.draft.title,
			(value) => { this.draft.title = value; });
		this.addCardNumber();
		this.addDescription();
		if (!this.isSkill()) this.addFlavor();
		this.addExpansion();
		this.addDerivedParent(); this.addCardType();
		if (!this.isSkill()) this.addFinish();
		this.addArtwork(); if (this.artworks.length > 1) this.addArtworkIndex();
		const battleground = this.isBattleground();
		if (!battleground || this.isSkill()) this.addClasses();
		if (!this.isSkill() && (!battleground || this.draft.cardKind === '随从')) this.addRarity();
		if (this.isSkill() || !(this.isHero() && battleground)) this.addCost();
		if (!this.isSkill() && this.draft.cardKind !== '法术') this.addStats();
		if (!this.isSkill() && !battleground && !this.isHero()) this.addTribes();
		if (!this.isSkill() && !battleground) this.addBanner();
		this.updatePreview();
		this.formEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
			if (this.closed) return;
			this.formEl.scrollTop = scroll;
		});
	}

	private setting(field: ModalField, name: string, description: string): Setting {
		const writable = this.isWritableField(field);
		const setting = new Setting(this.formEl).setName(name)
			.setDesc(writable ? description : `${description}, 未映射`)
			.setClass(`mbv-hs-property-${field}`);
		if (!writable) queueMicrotask(() => { setting.setDisabled(true); });
		return setting;
	}

	private addText(field: ModalField, name: string, description: string, value: string,
		set: (value: string) => void, placeholder = ''): void {
		this.setting(field, name, description).addText((input) => input.setValue(value).setPlaceholder(placeholder)
			.onChange((next) => { set(next); this.mark(field); }));
	}

	private addDescription(): void {
		const writable = this.isWritableField('description');
		const setting = this.setting('description', '描述', 'Markdown 文本');
		setting.settingEl.addClass('mbv-hs-inline-editor-setting');
		let sizingInput!: HTMLInputElement;
		setting.addText((input) => {
			sizingInput = input.inputEl;
			input.setPlaceholder('输入卡牌描述');
		});
		const shellEl = setting.controlEl.createDiv('mbv-hs-inline-editor-shell');
		sizingInput.replaceWith(shellEl);
		sizingInput.addClass('mbv-hs-inline-editor-sizer');
		sizingInput.setAttribute('aria-hidden', 'true');
		sizingInput.tabIndex = -1;
		shellEl.append(sizingInput);
		const editorEl = shellEl.createDiv('mbv-hs-inline-editor-field');
		this.descriptionEditor = new InlineMarkdownEditor(this.app, editorEl, {
			value: this.draft.description,
			file: this.file,
			placeholder: '输入卡牌描述',
			disabled: !writable,
			onChange: (value) => {
				this.draft.description = value;
				this.mark('description');
			},
		});
	}

	private addCardNumber(): void {
		const writable = writableHearthstoneProperty(this.options, 'cardNumber') !== null;
		this.setting('cardNumber', '卡牌编号', '排序值').addText(input => {
			const set = (value: string, immediate = false): void => {
				this.draft.cardNumber = value; this.mark('cardNumber', immediate);
			};
			input.setValue(this.draft.cardNumber).setPlaceholder('输入排序值')
				.onChange(value => { set(value); });
			if (writable) this.suggestions.push(new TextValueSuggest(
				this.app, input.inputEl, this.cardNumberValues, value => { set(value, true); },
			));
		});
	}

	private addFlavor(): void {
		this.addGrowingTextArea(
			'flavor', '趣闻', '文本', '输入卡牌趣闻',
			() => this.draft.flavor,
			(value) => { this.draft.flavor = value; },
		);
	}

	private addExpansion(): void {
		const writable = writableHearthstoneProperty(this.options, 'expansion') !== null;
		this.setting('expansion', '拓展包', '文本').addText(input => {
			const set = (value: string, immediate = false): void => {
				this.draft.expansion = value; this.mark('expansion', immediate);
			};
			input.setValue(this.draft.expansion).setPlaceholder('胜地历险记')
				.onChange(value => { set(value); });
			if (writable) this.suggestions.push(new TextValueSuggest(
				this.app, input.inputEl, this.expansionValues, value => { set(value, true); },
			));
		});
	}

	private addDerivedParent(): void {
		const writable = writableHearthstoneProperty(this.options, 'derivedParent') !== null;
		this.setting('derivedParent', '衍生父对象', '卡牌双链').addText(input => {
			const set = (value: string, immediate = false): void => {
				this.draft.derivedParent = value;
				this.mark('derivedParent', immediate);
			};
			input.setValue(this.draft.derivedParent).setPlaceholder('输入名称或路径')
				.onChange(value => { set(value); });
			if (writable) this.suggestions.push(new VaultMarkdownSuggest(
				this.app, input.inputEl, this.noteFiles, link => { set(link, true); },
			));
		});
	}

	private addGrowingTextArea(
		field: ModalField,
		name: string,
		description: string,
		placeholder: string,
		getValue: () => string,
		setValue: (value: string) => void,
	): void {
		this.setting(field, name, description).addTextArea((input) => {
			const textarea = input.inputEl;
			textarea.wrap = 'soft'; textarea.rows = 1;
			input.setValue(getValue()).setPlaceholder(placeholder)
				.onChange((value) => {
					setValue(value); this.resizeDescription(textarea); this.mark(field);
				});
			textarea.ownerDocument.defaultView?.requestAnimationFrame(() => {
				if (!this.closed && textarea.isConnected) this.resizeDescription(textarea);
			});
		});
	}

	private addCardType(): void {
		const setting = this.setting('cardType', '类型', '范围/类型/星级');
		setting.addDropdown((dropdown) => {
			for (const value of MINION_CARD_SCOPES) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.cardScope).onChange((value) => {
				this.draft.cardScope = value as MinionCardScope; this.applyCardType();
			});
		}).addDropdown((dropdown) => {
			for (const value of this.availableKinds()) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.cardKind).onChange((value) => {
				this.draft.cardKind = value as MinionCardKind; this.applyCardType();
			});
		});
		if (this.isTiered()) setting.addDropdown((dropdown) => {
			for (const tier of MINION_TIER_VALUES) dropdown.addOption(tier, tier);
			dropdown.setValue(this.draft.tier).onChange((value) => {
				this.draft.tier = value; this.mark('cardType', true);
			});
		});
	}

	private applyCardType(): void {
		if (this.isBattleground() && !this.availableKinds().includes(this.draft.cardKind)) this.draft.cardKind = '随从';
		this.mark('cardType', true);
		if (this.isSkill()) {
			if (this.draft.finish !== '普通') { this.draft.finish = '普通'; this.mark('finish', true); }
			if (this.draft.rarity !== '无') { this.draft.rarity = '无'; this.mark('rarity', true); }
			const costType: CostType = this.isBattleground() ? '铸币' : '法力水晶';
			if (this.draft.costType !== costType) { this.draft.costType = costType; this.mark('cost', true); }
			this.render();
			return;
		}
		if (this.isBattleground()) {
			const canBeGolden = this.draft.cardKind !== '法术';
			if (this.draft.finish !== '普通' && (!canBeGolden || this.draft.finish !== '金卡')) { this.draft.finish = '普通'; this.mark('finish', true); }
			if (!this.isHero()) {
				if (this.draft.cardKind !== '随从' || (this.draft.rarity !== '无' && this.draft.rarity !== '仅龙边')) { this.draft.rarity = '无'; this.mark('rarity', true); }
				if (!BATTLEGROUND_COST_TYPES.includes(this.draft.costType as typeof BATTLEGROUND_COST_TYPES[number])) { this.draft.costType = '铸币'; this.mark('cost', true); }
				this.draft.tier = String(Math.min(7, Math.max(1, Number.parseInt(this.draft.tier, 10) || 1)));
			}
		} else if (!TRADITIONAL_COST_TYPES.includes(this.draft.costType as typeof TRADITIONAL_COST_TYPES[number])) {
			this.draft.costType = '法力水晶'; this.mark('cost', true);
		}
		if (this.draft.cardKind !== '随从' && this.draft.finish === '钻石卡') { this.draft.finish = '普通'; this.mark('finish', true); }
		this.render();
	}

	private addFinish(): void {
		this.setting('finish', '外观', '普通/金卡/钻石/异画').addDropdown((dropdown) => {
			const finishes = this.isBattleground()
				? this.draft.cardKind === '法术' ? ['普通'] as const : ['普通', '金卡'] as const
				: this.draft.cardKind === '随从' ? MINION_FINISHES : ['普通', '金卡', '异画'] as const;
			for (const value of finishes) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.finish).onChange((value) => {
				this.draft.finish = value as MinionFinish; this.mark('finish', true); this.render();
			});
		});
	}

	private addArtwork(): void {
		const writable = writableHearthstoneProperty(this.options, 'artwork') !== null;
		this.setting('artwork', '原画', '图片双链').addText((input) => {
			this.artworkInputEl = input.inputEl;
			const set = (value: string, immediate = false): void => {
				this.draft.artwork = value; this.artworks[this.artworkIndex] = value; this.mark('artwork', immediate);
			};
			input.setValue(this.draft.artwork).setPlaceholder('输入名称或路径').onChange((value) => { set(value); });
			if (writable) this.suggestions.push(new VaultImageSuggest(this.app, input.inputEl, this.imageFiles, (link) => { set(link, true); }));
		});
	}

	private addArtworkIndex(): void {
		new Setting(this.formEl).setName('当前插画').setDesc('序号').setClass('mbv-hs-property-artwork-index')
			.addDropdown((dropdown) => {
				this.artworks.forEach((_, index) => { dropdown.addOption(String(index), String(index + 1)); });
				dropdown.setValue(String(this.artworkIndex)).onChange((value) => {
					this.artworkIndex = Number(value); this.draft.artwork = this.artworks[this.artworkIndex] ?? '';
					if (this.artworkInputEl) this.artworkInputEl.value = this.draft.artwork;
					this.updatePreview();
				});
			});
	}

	private addClasses(): void {
		const setting = this.setting('classes', '职业', '职业列表');
		setting.addDropdown((dropdown) => {
			for (const value of HEARTHSTONE_CLASSES) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.classes[0]).onChange((value) => {
				this.draft.classes[0] = value as HearthstoneClass; this.mark('classes', true);
			});
		}).addDropdown((dropdown) => {
			dropdown.addOption('', '无'); for (const value of HEARTHSTONE_CLASSES) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.classes[1]).onChange((value) => {
				this.draft.classes[1] = value as HearthstoneClass | ''; this.mark('classes', true);
			});
		});
	}

	private addRarity(): void {
		this.setting('rarity', '稀有度', '无/仅龙边/普通/稀有/史诗/传说').addDropdown((dropdown) => {
			const rarities = this.isBattleground() ? ['无', '仅龙边'] as const : MINION_RARITIES;
			for (const value of rarities) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.rarity).onChange((value) => {
				this.draft.rarity = value as MinionRarity; this.mark('rarity', true);
			});
		});
	}

	private addCost(): void {
		const battleground = this.isBattleground();
		const choices: readonly CostType[] = this.isSkill()
			? [battleground ? '铸币' : '法力水晶']
			: battleground ? BATTLEGROUND_COST_TYPES : TRADITIONAL_COST_TYPES;
		const setting = this.setting('cost', '消耗', `${choices.join('/')}-数值`);
		if (choices.length > 1) setting.addDropdown((dropdown) => {
			for (const value of choices) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.costType).onChange((value) => {
				const wasEmpty = this.draft.costType === '无';
				this.draft.costType = value as CostType;
				if (this.draft.costType === '无') this.draft.costValue = '';
				this.mark('cost', true);
				if (wasEmpty !== (this.draft.costType === '无')) this.render();
			});
		});
		if (this.draft.costType !== '无') setting.addText((input) => input
			.setValue(this.draft.costValue)
			.setPlaceholder('数值或文字')
			.onChange((value) => { this.draft.costValue = value; this.mark('cost'); }));
	}

	private addStats(): void {
		if (this.isHero()) {
			const name = '护甲值';
			this.addText('stats', name, name, this.draft.stats, (value) => { this.draft.stats = value; }, '2');
			return;
		}
		if (this.draft.cardKind === '地标') {
			this.addText('stats', '耐久度', '耐久度', this.draft.stats, (value) => { this.draft.stats = value; }, '2');
			return;
		}
		const description = this.draft.cardKind === '武器' ? '攻击力/耐久度' : '攻击力/生命值';
		this.addText('stats', '属性值', description, this.draft.stats, (value) => { this.draft.stats = value; }, '4/8');
	}

	private addTribes(): void {
		const name = this.draft.cardKind === '随从' ? '种族' : this.draft.cardKind === '法术' ? '派系' : '类型';
		const plural = this.draft.cardKind === '随从' || this.draft.cardKind === '法术';
		const writable = writableHearthstoneProperty(this.options, 'tribes') !== null;
		const setting = this.setting('tribes', name, `${name}列表`);
		const add = (index: 0 | 1, placeholder: string): void => {
			setting.addText(input => {
				const set = (value: string, immediate = false): void => {
					this.draft.tribes[index] = value; this.mark('tribes', immediate);
				};
				input.setValue(this.draft.tribes[index]).setPlaceholder(placeholder)
					.onChange(value => { set(value); });
				if (writable) this.suggestions.push(new TextValueSuggest(
					this.app, input.inputEl, this.tribeValues, value => { set(value, true); },
				));
			});
		};
		add(0, name);
		if (plural) add(1, `第二${name}`);
	}

	private addBanner(): void {
		const setting = this.setting('banner', '旗帜/符文', '旗帜或三个符文');
		setting.addDropdown((dropdown) => {
			for (const value of MINION_BANNERS) dropdown.addOption(value, value);
			dropdown.setValue(this.draft.banner).onChange((value) => {
				this.draft.banner = value; this.mark('banner', true); this.render();
			});
		});
		if (this.draft.banner === '符文') this.draft.runes.forEach((rune, index) => {
			setting.addDropdown((dropdown) => {
				for (const value of RUNE_TYPES) dropdown.addOption(value, value);
				dropdown.setValue(rune).onChange((value) => {
					this.draft.runes[index] = value as RuneType; this.mark('banner', true);
				});
			});
		});
	}

	private resizeDescription(textarea: HTMLTextAreaElement): void {
		textarea.setCssProps({ '--mbv-hs-description-height': 'auto' });
		const maximum = Math.max(96, Math.round((textarea.ownerDocument.defaultView?.innerHeight ?? window.innerHeight) * 0.4));
		textarea.setCssProps({ '--mbv-hs-description-height': `${Math.min(textarea.scrollHeight, maximum)}px` });
		textarea.classList.toggle('is-scrollable', textarea.scrollHeight > maximum);
	}

	private mark(field: ModalField, immediate = false): void {
		this.dirty.add(field); this.updatePreview();
		if (immediate) { this.enqueueSave(); return; }
		const ownerWindow = this.formEl.ownerDocument.defaultView ?? window;
		if (this.saveTimer !== null) ownerWindow.clearTimeout(this.saveTimer);
		this.saveTimer = ownerWindow.setTimeout(() => { this.saveTimer = null; this.enqueueSave(); }, 250);
	}

	private enqueueSave(): void {
		if (this.saveTimer !== null) { (this.formEl.ownerDocument.defaultView ?? window).clearTimeout(this.saveTimer); this.saveTimer = null; }
		this.saveChain = this.saveChain.then(() => this.saveDirty()).catch((error: unknown) => {
			new Notice(error instanceof Error ? error.message : '保存卡牌属性失败.');
		});
	}

	private flushSave(): Promise<void> { this.enqueueSave(); return this.saveChain; }

	private updatePreview(): void {
		const [firstClass, secondClass] = this.draft.classes;
		const position = this.artworkPositions[this.artworkIndex] ?? parseArtworkPosition(null);
		this.preview.update({
			title: this.draft.title, description: this.draft.description, flavor: this.draft.flavor,
			expansion: this.draft.expansion, cardType: this.cardType(),
			finish: this.draft.finish, artwork: this.artworks[this.artworkIndex], artworkPosition: formatArtworkPosition(position),
			classes: secondClass && secondClass !== firstClass ? [firstClass, secondClass] : [firstClass],
			rarity: this.draft.rarity, cost: formatMinionCost(this.draft.costType, this.draft.costValue),
			stats: this.draft.stats,
			tribes: this.draft.tribes.map((value) => value.trim()).filter(Boolean),
			banner: formatMinionBanner(this.draft.banner, this.draft.runes),
		});
	}

	private bindPositionEditor(): void {
		const positionProperty = writableHearthstoneProperty(this.options, 'artworkPosition');
		this.preview.surface.classList.toggle('is-position-disabled', !positionProperty);
		this.releasePositionEditor = bindArtworkPointerEditor({
			surface: this.preview.surface,
			isEnabled: () => Boolean(positionProperty && this.artworks[this.artworkIndex]),
			getPosition: () => this.artworkPositions[this.artworkIndex] ?? parseArtworkPosition(null),
			setPosition: (position) => {
				this.artworkPositions[this.artworkIndex] = position; this.positionChanged = true; this.preview.setPosition(position);
			},
			setDragging: (dragging) => this.preview.surface.classList.toggle('is-dragging', dragging),
			wheelDeltaThreshold: 100,
			maximumScale: 6,
			onCommit: () => {
				if (!this.positionChanged) return;
				this.positionChanged = false; this.mark('artworkPosition');
			},
		});
	}

	private cardType(): ReturnType<typeof formatMinionCardType> {
		return formatMinionCardType(this.draft.cardScope, this.draft.cardKind, Number(this.draft.tier));
	}
	private isBattleground(): boolean { return this.draft.cardScope === '酒馆战棋'; }
	private isHero(): boolean { return this.draft.cardKind === '英雄'; }
	private isSkill(): boolean { return this.draft.cardKind === '技能'; }
	private isTiered(): boolean { return this.isBattleground() && (this.draft.cardKind === '随从' || this.draft.cardKind === '法术'); }
	private availableKinds(): readonly MinionCardKind[] {
		return this.isBattleground() ? ['随从', '英雄', '技能', '法术'] : MINION_CARD_KINDS;
	}
	private titleFallback(): string | undefined {
		return this.options.properties.title ? undefined : this.file.basename;
	}
	private isWritableField(field: ModalField): boolean {
		return field === 'title' && !this.options.properties.title ||
			writableHearthstoneProperty(this.options, field) !== null;
	}

	private async saveDirty(): Promise<void> {
		const fields = [...this.dirty];
		if (!fields.length) return;
		for (const field of fields) this.dirty.delete(field);
		const changes = new Map<string, { before: unknown; after: unknown }>();
		try {
			if (fields.includes('title') && !this.options.properties.title) await this.renameFile();
			for (const field of fields) {
				const property = writableHearthstoneProperty(this.options, field);
				if (!property) continue;
				const after = this.serialize(field), before = this.original.get(property);
				if (JSON.stringify(before) === JSON.stringify(after)) continue;
				const previous = changes.get(property);
				if (previous && JSON.stringify(previous.after) !== JSON.stringify(after)) throw new Error(`${property} 映射到多个字段, 修改内容存在冲突.`);
				changes.set(property, { before, after });
			}
			if (changes.size) await saveHearthstoneProperties(this.app, this.file, changes);
			for (const [property, change] of changes) this.original.set(property, structuredClone(change.after));
		} catch (error) {
			for (const field of fields) this.dirty.add(field);
			throw error;
		}
	}
	private async renameFile(): Promise<void> {
		const entered = this.draft.title.trim();
		if (!entered) throw new Error('文件名不能为空.');
		if (/[\\/:*?"<>|]/u.test(entered)) throw new Error('文件名包含无效字符.');
		const extension = this.file.extension ? `.${this.file.extension}` : '';
		const basename = extension && entered.toLowerCase().endsWith(extension.toLowerCase())
			? entered.slice(0, -extension.length).trim()
			: entered;
		if (!basename) throw new Error('文件名不能为空.');
		if (basename === this.file.basename) return;
		const separator = this.file.path.lastIndexOf('/');
		const folder = separator >= 0 ? this.file.path.slice(0, separator + 1) : '';
		await this.app.fileManager.renameFile(this.file, normalizePath(`${folder}${basename}${extension}`));
		this.draft.title = basename;
	}

	private serialize(field: ModalField): unknown {
		if (field === 'cardType') return this.cardType();
		if (field === 'artwork') {
			const values = this.artworks.map((value) => value.trim()).filter(Boolean);
			return values.length > 1 ? values : values[0];
		}
		if (field === 'artworkPosition') {
			return this.artworkPositions.map(formatArtworkPosition).join('; ');
		}
		if (field === 'classes') {
			const [first, second] = this.draft.classes;
			return second && second !== first ? [first, second] : [first];
		}
		if (field === 'tribes') {
			const values = this.draft.tribes.map((value) => value.trim()).filter(Boolean);
			return values.length ? values : undefined;
		}
		if (field === 'cost') return formatMinionCost(this.draft.costType, this.draft.costValue) || undefined;
		if (field === 'banner') return formatMinionBanner(this.draft.banner, this.draft.runes);
		if (field === 'stats') {
			const value = this.draft.stats.trim();
			if ((this.draft.cardKind === '随从' || this.draft.cardKind === '武器') && value && !/^[^/]+\/[^/]+$/u.test(value)) {
				throw new Error(`属性值格式应为 ${this.draft.cardKind === '武器' ? '攻击力/耐久度' : '攻击力/生命值'}.`);
			}
			return value || undefined;
		}
		const value = this.draft[field];
		return typeof value === 'string' ? value.trim() || undefined : value;
	}

	private closeSuggestions(): void { for (const suggestion of this.suggestions) suggestion.close(); this.suggestions = []; }
}

function allValues(value: unknown): string[] {
	return (Array.isArray(value) ? value : [value]).map(valueText).filter(Boolean);
}
