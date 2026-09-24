import {
	AbstractInputSuggest,
	Notice,
	ProgressBarComponent,
	ToggleComponent,
	prepareSimpleSearch,
	setIcon,
	type App,
	type BasesPropertyId,
	type BasesQueryResult,
	type BasesViewConfig,
	type EventRef,
	type QueryController,
	type TFile,
} from 'obsidian';
import {
	createBatchPlan,
	createFileSetSignature,
	executeBatchPlan,
	findVaultPropertyTypeConflicts,
	getBatchActionLabel,
	validateBatchPlanState,
	validateBatchOperation,
	type FrontmatterBatchAction,
	type FrontmatterBatchOperation,
	type FrontmatterValueType,
} from '../views/frontmatter/frontmatter-batch';
import { FrontmatterPreviewModal } from '../views/frontmatter/frontmatter-preview-modal';

const BASES_VIEW_TYPE = 'bases';
const TABLE_VIEW_TYPE = 'table';
const PROPERTY_MANAGER_CONFIG_KEY = 'albusPropertyManager';

interface InternalBasesQuery {
	save?: () => void | Promise<void>;
}

interface InternalTableView {
	type: string;
	containerEl: HTMLElement;
	config: BasesViewConfig;
	data: BasesQueryResult;
	allProperties: BasesPropertyId[];
}

interface InternalQueryController extends QueryController {
	query?: InternalBasesQuery | null;
	view?: InternalTableView | null;
	viewHeaderEl?: HTMLElement;
	viewContainerEl?: HTMLElement;
	viewMenu?: InternalViewMenu | null;
}

interface InternalViewMenuPage {
	formEl?: HTMLElement;
}

interface InternalViewMenu {
	pageStack?: InternalViewMenuPage[];
	toolbarItem?: {
		scrollEl?: HTMLElement;
	};
}

interface InternalBasesFileView {
	controller?: unknown;
}

interface InternalMetadataTypeInfo {
	expected?: { type?: string };
	inferred?: { type?: string };
}

interface InternalMetadataTypeManager {
	getAllProperties?: () => Record<string, { widget?: string }>;
	getAssignedWidget: (property: string) => string | null | undefined;
	getTypeInfo: (property: string, value?: unknown) => InternalMetadataTypeInfo;
	setType: (property: string, type: string) => void | Promise<void>;
}

interface InternalApp extends App {
	metadataTypeManager?: InternalMetadataTypeManager;
}

export class TablePropertyManagerService {
	private readonly instances = new Map<HTMLElement, TablePropertyManagerInstance>();
	private readonly eventRefs: EventRef[] = [];
	private scanFrame: number | null = null;
	private started = false;
	private destroyed = false;

	constructor(private readonly app: App) {}

	start(): void {
		if (this.started || this.destroyed) return;
		this.started = true;
		this.app.workspace.onLayoutReady(() => {
			if (this.destroyed) return;
			this.eventRefs.push(
				this.app.workspace.on('layout-change', () => this.scheduleScan()),
				this.app.workspace.on('active-leaf-change', () => this.scheduleScan()),
				this.app.workspace.on('file-open', () => this.scheduleScan()),
			);
			this.scheduleScan();
		});
	}

	destroy(): void {
		this.destroyed = true;
		if (this.scanFrame !== null) {
			window.cancelAnimationFrame(this.scanFrame);
			this.scanFrame = null;
		}
		for (const eventRef of this.eventRefs) this.app.workspace.offref(eventRef);
		this.eventRefs.length = 0;
		for (const instance of this.instances.values()) instance.destroy();
		this.instances.clear();
	}

	private scheduleScan(): void {
		if (this.scanFrame !== null) return;
		this.scanFrame = window.requestAnimationFrame(() => {
			this.scanFrame = null;
			this.scan();
		});
	}

	private scan(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(BASES_VIEW_TYPE)) {
			const candidate = (leaf.view as unknown as InternalBasesFileView).controller;
			if (!isInternalController(candidate)) continue;
			const controller = candidate;
			const headerEl = controller.viewHeaderEl;
			const current = this.instances.get(headerEl);
			if (current) current.setController(controller);
			else {
				this.instances.set(
					headerEl,
					new TablePropertyManagerInstance(this.app, headerEl, controller),
				);
			}
		}

		for (const [headerEl, instance] of this.instances) {
			if (headerEl.isConnected) continue;
			instance.destroy();
			this.instances.delete(headerEl);
		}
	}
}

class TablePropertyManagerInstance {
	private readonly menuObserver: MutationObserver;
	private readonly viewObserver: MutationObserver;
	private observedMenuRootEl: HTMLElement | null = null;
	private refreshFrame: number | null = null;
	private panel: TablePropertyManagerPanel | null = null;
	private destroyed = false;
	private observedViewContainer: HTMLElement | null = null;

	constructor(
		private readonly app: App,
		private readonly headerEl: HTMLElement,
		private controller: InternalQueryController,
	) {
		this.menuObserver = new MutationObserver(() => this.scheduleRefresh());
		this.observeViewMenu();
		this.viewObserver = new MutationObserver((mutations) => {
			if (
				this.panel &&
				mutations.every((mutation) => this.panel?.contains(mutation.target) === true)
			) return;
			this.scheduleRefresh();
		});
		this.observeViewContainer();
		this.refresh();
	}

	setController(controller: InternalQueryController): void {
		this.controller = controller;
		this.observeViewMenu();
		this.observeViewContainer();
		this.scheduleRefresh();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.refreshFrame !== null) {
			this.headerEl.win.cancelAnimationFrame(this.refreshFrame);
			this.refreshFrame = null;
		}
		this.menuObserver.disconnect();
		this.viewObserver.disconnect();
		this.panel?.destroy();
		this.panel = null;
	}

	private observeViewContainer(): void {
		const next = this.controller.viewContainerEl ?? null;
		if (next === this.observedViewContainer) return;
		this.viewObserver.disconnect();
		this.observedViewContainer = next;
		if (next) {
			this.viewObserver.observe(next, {
				childList: true,
				subtree: true,
			});
		}
	}

	private observeViewMenu(): void {
		const next = this.controller.viewMenu?.toolbarItem?.scrollEl ?? null;
		if (next === this.observedMenuRootEl) return;
		this.menuObserver.disconnect();
		this.observedMenuRootEl = next;
		if (next) {
			this.menuObserver.observe(next, {
				attributes: true,
				childList: true,
				subtree: true,
			});
		}
	}

	private scheduleRefresh(): void {
		if (this.destroyed || this.refreshFrame !== null) return;
		this.refreshFrame = this.headerEl.win.requestAnimationFrame(() => {
			this.refreshFrame = null;
			this.refresh();
		});
	}

	private refresh(): void {
		if (this.destroyed) return;
		this.injectSettingsToggle();
		const tableView = this.getTableView();
		if (!tableView || tableView.config.get(PROPERTY_MANAGER_CONFIG_KEY) !== true) {
			this.panel?.destroy();
			this.panel = null;
			return;
		}
		if (!this.panel) {
			this.panel = new TablePropertyManagerPanel(
				this.app,
				() => this.getTableView(),
			);
		}
		this.panel.attach(tableView);
	}

	private getTableView(): InternalTableView | null {
		const view = this.controller.view;
		if (
			view?.type !== TABLE_VIEW_TYPE ||
			!view.containerEl ||
			typeof view.containerEl.prepend !== 'function' ||
			!view.config ||
			!view.data
		) return null;
		return view;
	}

	private injectSettingsToggle(): void {
		const tableView = this.getTableView();
		if (!tableView) return;
		const currentPage = this.controller.viewMenu?.pageStack?.at(-1);
		const pageFormEl = currentPage?.formEl;
		const formEl = pageFormEl?.hasClass('view-config-menu')
			? pageFormEl
			: this.observedMenuRootEl?.querySelector<HTMLElement>('.view-config-menu') ?? null;
		if (!formEl || formEl.querySelector('.mbv-table-property-setting')) return;

		const rowEl = formEl.createDiv('input-row mbv-table-property-setting');
		rowEl.createDiv({ cls: 'input-row-label', text: '属性管理' });
		const contentEl = rowEl.createDiv('input-row-content');
		const toggle = new ToggleComponent(contentEl);
		toggle.setValue(tableView.config.get(PROPERTY_MANAGER_CONFIG_KEY) === true);
		toggle.setTooltip('在官方表格上方显示批量属性管理器');
		toggle.onChange((enabled) => void this.setEnabled(tableView, toggle, enabled));
	}

	private async setEnabled(
		tableView: InternalTableView,
		toggle: ToggleComponent,
		enabled: boolean,
	): Promise<void> {
		const previous = tableView.config.get(PROPERTY_MANAGER_CONFIG_KEY);
		tableView.config.set(PROPERTY_MANAGER_CONFIG_KEY, enabled);
		this.refresh();
		try {
			await this.controller.query?.save?.();
		} catch {
			tableView.config.set(PROPERTY_MANAGER_CONFIG_KEY, previous ?? null);
			toggle.setValue(previous === true);
			this.refresh();
			new Notice('保存属性管理开关失败.');
		}
	}
}

class TablePropertyManagerPanel {
	private readonly panelEl: HTMLElement;
	private readonly actionSelectEl: HTMLSelectElement;
	private readonly propertyInputEl: HTMLInputElement;
	private readonly valueInputEl: HTMLInputElement;
	private readonly oldValueInputEl: HTMLInputElement;
	private readonly newPropertyInputEl: HTMLInputElement;
	private readonly propertyTypeSelectEl: HTMLSelectElement;
	private readonly executeButtonEl: HTMLButtonElement;
	private readonly statusEl: HTMLElement;
	private readonly progressEl: HTMLElement;
	private readonly progressBar: ProgressBarComponent;
	private readonly propertySuggest: PropertyNameSuggest;
	private readonly newPropertySuggest: PropertyNameSuggest;
	private tableView: InternalTableView | null = null;
	private processing = false;

	constructor(
		private readonly app: App,
		private readonly getCurrentTableView: () => InternalTableView | null,
	) {
		this.panelEl = createDiv('mbv-table-property-panel');
		const headingEl = this.panelEl.createDiv('mbv-frontmatter-batch-row');
		const scopeEl = headingEl.createDiv('mbv-frontmatter-scope');
		const scopeIconEl = scopeEl.createSpan('mbv-frontmatter-scope-icon');
		setIcon(scopeIconEl, 'table-properties');
		scopeEl.createSpan({ text: '批量属性管理' });
		this.statusEl = headingEl.createDiv('mbv-frontmatter-status');

		const controlsEl = this.panelEl.createDiv('mbv-frontmatter-batch-controls');
		this.actionSelectEl = controlsEl.createEl('select', {
			cls: 'dropdown mbv-frontmatter-action',
			attr: { 'aria-label': '批处理操作' },
		});
		for (const action of ['add', 'update', 'remove', 'replace', 'rename'] as const) {
			this.actionSelectEl.createEl('option', {
				text: getBatchActionLabel(action),
				attr: { value: action },
			});
		}
		this.propertyInputEl = createTextInput(controlsEl, '属性名', '属性名');
		this.propertySuggest = new PropertyNameSuggest(this.app, this.propertyInputEl);
		this.valueInputEl = createTextInput(controlsEl, '属性值', '属性值');
		this.oldValueInputEl = createTextInput(controlsEl, '要替换的旧内容', '旧内容');
		this.newPropertyInputEl = createTextInput(controlsEl, '新属性名', '新属性名');
		this.newPropertySuggest = new PropertyNameSuggest(this.app, this.newPropertyInputEl);
		this.propertyTypeSelectEl = controlsEl.createEl('select', {
			cls: 'dropdown mbv-frontmatter-type',
			attr: { 'aria-label': '属性类型' },
		});
		for (const [value, label] of PROPERTY_TYPE_OPTIONS) {
			this.propertyTypeSelectEl.createEl('option', {
				text: label,
				attr: { value },
			});
		}

		this.executeButtonEl = controlsEl.createEl('button', {
			cls: 'mod-cta mbv-frontmatter-execute',
			attr: { type: 'button' },
		});
		const executeIconEl = this.executeButtonEl.createSpan();
		setIcon(executeIconEl, 'scan-search');
		this.executeButtonEl.createSpan({ text: '预览并执行' });
		this.progressEl = this.panelEl.createDiv('mbv-frontmatter-progress');
		this.progressEl.hidden = true;
		this.progressBar = new ProgressBarComponent(
			this.progressEl.createDiv('mbv-frontmatter-progress-bar'),
		);
		this.actionSelectEl.addEventListener('change', () => this.syncOperationFields());
		this.executeButtonEl.addEventListener('click', () => void this.previewAndExecute());
		this.syncOperationFields();
	}

	attach(tableView: InternalTableView): void {
		if (this.tableView !== tableView) {
			this.detachFromTable();
			this.tableView = tableView;
		}
		const tableRootEl = tableView.containerEl.closest<HTMLElement>(
			'.bases-view[data-view-type="table"]',
		) ?? tableView.containerEl;
		if (this.panelEl.nextElementSibling !== tableRootEl) {
			tableRootEl.before(this.panelEl);
		}
		this.renderPropertySuggestions(tableView.allProperties);
		if (!this.processing) this.showCurrentScope();
	}

	destroy(): void {
		this.propertySuggest.close();
		this.newPropertySuggest.close();
		this.detachFromTable();
		this.panelEl.remove();
		this.tableView = null;
	}

	contains(target: Node): boolean {
		return this.panelEl.contains(target);
	}

	private detachFromTable(): void {
		this.panelEl.remove();
	}

	private renderPropertySuggestions(properties: readonly BasesPropertyId[]): void {
		const names = new Set<string>();
		for (const property of properties) {
			if (property.startsWith('note.')) names.add(property.slice(5));
		}
		const sortedNames = [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
		this.propertySuggest.setItems(sortedNames);
		this.newPropertySuggest.setItems(sortedNames);
	}

	private getCurrentFiles(): TFile[] {
		const entries = this.getCurrentTableView()?.data.data ?? [];
		const files = new Map<string, TFile>();
		for (const entry of entries) {
			if (entry.file.extension === 'md') files.set(entry.file.path, entry.file);
		}
		return [...files.values()];
	}

	private showCurrentScope(): void {
		const files = this.getCurrentFiles();
		this.setStatus(`当前表格结果  -  ${files.length} 个笔记`);
	}

	private syncOperationFields(): void {
		const action = this.actionSelectEl.value as FrontmatterBatchAction;
		const fieldState = getOperationFieldState(action);
		this.propertySuggest.close();
		this.newPropertySuggest.close();
		setInputVisibility(this.propertyInputEl, true, this.processing);
		setInputVisibility(this.valueInputEl, fieldState.value, this.processing);
		setInputVisibility(this.oldValueInputEl, fieldState.oldValue, this.processing);
		setInputVisibility(
			this.newPropertyInputEl,
			fieldState.newProperty,
			this.processing,
		);
		setSelectVisibility(
			this.propertyTypeSelectEl,
			fieldState.propertyType,
			this.processing,
		);
		this.propertyInputEl.placeholder = action === 'rename' ? '旧属性名' : '属性名';
		this.valueInputEl.placeholder = action === 'replace' ? '替换后的内容' : '属性值';
		this.propertyInputEl.setCssProps({ order: '1' });
		this.oldValueInputEl.setCssProps({ order: '2' });
		this.newPropertyInputEl.setCssProps({ order: '2' });
		this.valueInputEl.setCssProps({ order: action === 'replace' ? '3' : '2' });
		this.propertyTypeSelectEl.setCssProps({ order: '3' });
		this.executeButtonEl.setCssProps({ order: '4' });
	}

	private getOperation(): FrontmatterBatchOperation {
		const action = this.actionSelectEl.value as FrontmatterBatchAction;
		const property = this.propertyInputEl.value;
		const selectedType = this.getSelectedPropertyType();
		switch (action) {
			case 'add':
			case 'update':
				return {
					action,
					property,
					value: this.valueInputEl.value,
					valueType: selectedType ?? this.getExistingValueType(property),
					...(selectedType ? { propertyType: selectedType } : {}),
				};
			case 'remove':
				return { action, property };
			case 'replace':
				return {
					action,
					property,
					oldValue: this.oldValueInputEl.value,
					value: this.valueInputEl.value,
				};
			case 'rename':
				{
					const valueType = selectedType ??
						this.getSupportedKnownValueType(this.newPropertyInputEl.value) ??
						this.getSupportedKnownValueType(property);
					return {
						action,
						property,
						newProperty: this.newPropertyInputEl.value,
						valueType,
						...(selectedType ? { propertyType: selectedType } : {}),
					};
				}
		}
	}

	private getSelectedPropertyType(): FrontmatterValueType | null {
		const value = this.propertyTypeSelectEl.value;
		return isFrontmatterValueType(value) ? value : null;
	}

	private getExistingValueType(property: string): FrontmatterValueType {
		return this.getSupportedKnownValueType(property) ?? 'text';
	}

	private getSupportedKnownValueType(property: string): FrontmatterValueType | null {
		const manager = getMetadataTypeManager(this.app);
		if (!manager) return null;
		const normalized = normalizePropertyName(property);
		if (isReservedPropertyName(normalized)) return 'multitext';
		const assigned = manager.getAssignedWidget(normalized);
		const allProperties = manager.getAllProperties?.() ?? {};
		const registeredKey = Object.keys(allProperties).find(
			(key) => key.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
		);
		const registered = registeredKey ? allProperties[registeredKey] : undefined;
		const rawType = assigned ?? registered?.widget ??
			manager.getTypeInfo(normalized).inferred?.type;
		if (!rawType) return null;
		const supported = normalizeFrontmatterValueType(rawType);
		if (!supported) {
			throw new Error(`属性 ${normalized} 使用了暂不支持的类型 ${rawType}, 请明确选择目标类型.`);
		}
		return supported;
	}

	private async previewAndExecute(): Promise<void> {
		if (this.processing) return;
		let operation: FrontmatterBatchOperation;
		try {
			operation = this.getOperation();
		} catch (error) {
			new Notice(getErrorMessage(error));
			return;
		}
		const error = validateBatchOperation(operation);
		if (error) {
			new Notice(error);
			return;
		}
		if (
			'propertyType' in operation &&
			operation.propertyType &&
			!isReservedPropertyName(
				operation.action === 'rename' ? operation.newProperty : operation.property,
			) &&
			!getMetadataTypeManager(this.app)
		) {
			new Notice('当前 Obsidian 版本未提供属性类型服务, 未执行任何修改.');
			return;
		}
		const files = this.getCurrentFiles();
		if (files.length === 0) {
			new Notice('当前表格结果中没有可处理的 Markdown 笔记.');
			return;
		}
		this.setProcessing(true, '正在安全扫描当前表格结果...');
		try {
			const plan = await createBatchPlan(
				this.app,
				files,
				operation,
				(completed, total) => this.updateProgress(
					`正在安全扫描 (${completed}/${total})...`, completed, total,
				),
			);
			if ('propertyType' in plan.operation && plan.operation.propertyType) {
				plan.typeConflicts = await findVaultPropertyTypeConflicts(
					this.app,
					plan,
					true,
					(completed, total) => this.updateProgress(
						`正在校验仓库属性类型 (${completed}/${total})...`, completed, total,
					),
				);
			}
			this.setProcessing(false);
			new FrontmatterPreviewModal(this.app, plan, () => void this.executePlan(plan)).open();
		} catch (error) {
			this.setProcessing(false);
			new Notice(`生成变更预览失败, 未修改任何文件: ${getErrorMessage(error)}`);
		}
	}

	private async executePlan(plan: Awaited<ReturnType<typeof createBatchPlan>>): Promise<void> {
		if (this.processing) return;
		if (createFileSetSignature(this.getCurrentFiles()) !== plan.scopeSignature) {
			new Notice('当前表格筛选结果已变化, 请重新预览后再执行.');
			return;
		}
		if (plan.typeConflicts.length > 0) {
			new Notice('仓库中存在与目标属性类型不兼容的数据, 未执行任何修改.');
			return;
		}
		this.setProcessing(true, plan.changes.length > 0 ? '正在写入属性...' : '正在校验属性类型...');
		try {
			if (plan.changes.length === 0) {
				const propertyTypeChanged = plan.matchedProperties > 0 && plan.conflicts.length === 0
					? await this.applyPropertyTypeSafely(plan)
					: false;
				new Notice(propertyTypeChanged
					? '属性类型已更新, 笔记内容无需改写.'
					: '属性值和属性类型均无需修改.');
				return;
			}
			const staleChanges = await validateBatchPlanState(
				this.app,
				plan,
				(completed, total) => this.updateProgress(
					`正在复核变更 (${completed}/${total})...`, completed, total,
				),
			);
			if (staleChanges.length > 0) {
				new Notice(`有 ${staleChanges.length} 个文件在预览后发生变化, 未写入任何文件, 请重新预览.`);
				return;
			}
			const result = await executeBatchPlan(
				this.app,
				plan,
				(completed, total) => this.updateProgress(
					`正在写入 (${completed}/${total})...`, completed, total,
				),
			);
			let typeUpdated = false;
			if (result.failed.length === 0) typeUpdated = await this.applyPropertyTypeSafely(plan);
			new Notice(createResultNotice(
				result.succeeded.length,
				result.failed.length,
				result.notAttempted,
				plan.conflicts.length,
				plan.skipped,
				typeUpdated,
			));
			const firstFailure = result.failed[0];
			if (firstFailure) {
				new Notice(
					`已停止后续写入: ${firstFailure.file.path}: ${firstFailure.reason}`,
					10000,
				);
			}
		} catch (error) {
			new Notice(`批量操作异常终止: ${getErrorMessage(error)}`);
		} finally {
			this.setProcessing(false);
		}
	}

	private async applyPropertyTypeSafely(
		plan: Awaited<ReturnType<typeof createBatchPlan>>,
	): Promise<boolean> {
		if (!('propertyType' in plan.operation) || !plan.operation.propertyType) return false;
		this.setStatus('正在复核仓库属性类型...', true);
		const conflicts = await findVaultPropertyTypeConflicts(this.app, plan, false);
		if (conflicts.length > 0) {
			new Notice(`属性值已写入, 但仓库中仍有 ${conflicts.length} 个不兼容值, 未更改全局属性类型.`);
			return false;
		}
		return this.applyPropertyType(plan.operation);
	}

	private setProcessing(processing: boolean, status = ''): void {
		this.processing = processing;
		this.executeButtonEl.disabled = processing;
		this.actionSelectEl.disabled = processing;
		this.syncOperationFields();
		this.progressEl.hidden = !processing;
		if (processing) {
			this.progressBar.setValue(0);
			this.setStatus(status, true);
		} else this.showCurrentScope();
	}

	private updateProgress(status: string, completed: number, total: number): void {
		this.setStatus(status, true);
		this.progressBar.setValue(total > 0 ? completed / total * 100 : 0);
	}

	private setStatus(text: string, active = false): void {
		this.statusEl.setText(text);
		this.statusEl.classList.toggle('is-active', active);
	}

	private async applyPropertyType(
		operation: FrontmatterBatchOperation,
	): Promise<boolean> {
		if (!('propertyType' in operation) || !operation.propertyType) return false;
		const property = normalizePropertyName(
			operation.action === 'rename' ? operation.newProperty : operation.property,
		);
		if (isReservedPropertyName(property)) return false;
		const manager = getMetadataTypeManager(this.app);
		if (!manager) {
			new Notice('属性值已经写入, 但当前 Obsidian 版本未提供属性类型注册服务.');
			return false;
		}
		if (manager.getAssignedWidget(property) === operation.propertyType) return false;
		try {
			await manager.setType(property, operation.propertyType);
			const assigned = normalizeFrontmatterValueType(
				manager.getAssignedWidget(property) ?? undefined,
			);
			if (assigned !== operation.propertyType) {
				new Notice(`${property} 的类型注册结果未通过校验.`);
				return false;
			}
			return true;
		} catch {
			new Notice(`属性值已经写入, 但 ${property} 的类型注册失败.`);
			return false;
		}
	}
}

class PropertyNameSuggest extends AbstractInputSuggest<string> {
	private items: readonly string[] = [];

	setItems(items: readonly string[]): void {
		this.items = items;
	}

	protected getSuggestions(query: string): string[] {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) return this.items.slice(0, this.limit);
		const search = prepareSimpleSearch(normalizedQuery);
		return this.items
			.filter((item) => search(item) !== null)
			.slice(0, this.limit);
	}

	renderSuggestion(value: string, element: HTMLElement): void {
		element.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

function createTextInput(
	containerEl: HTMLElement,
	placeholder: string,
	label: string,
): HTMLInputElement {
	return containerEl.createEl('input', {
		type: 'text',
		cls: 'mbv-frontmatter-input',
		attr: { placeholder, 'aria-label': label, spellcheck: 'false' },
	});
}

interface OperationFieldState {
	value: boolean;
	oldValue: boolean;
	newProperty: boolean;
	propertyType: boolean;
}

function getOperationFieldState(action: FrontmatterBatchAction): OperationFieldState {
	switch (action) {
		case 'add':
		case 'update':
			return { value: true, oldValue: false, newProperty: false, propertyType: true };
		case 'remove':
			return { value: false, oldValue: false, newProperty: false, propertyType: false };
		case 'replace':
			return { value: true, oldValue: true, newProperty: false, propertyType: false };
		case 'rename':
			return { value: false, oldValue: false, newProperty: true, propertyType: true };
	}
}

function setInputVisibility(
	input: HTMLInputElement,
	visible: boolean,
	processing: boolean,
): void {
	input.hidden = !visible;
	input.disabled = processing || !visible;
	input.tabIndex = visible ? 0 : -1;
}

function setSelectVisibility(
	select: HTMLSelectElement,
	visible: boolean,
	processing: boolean,
): void {
	select.hidden = !visible;
	select.disabled = processing || !visible;
	select.tabIndex = visible ? 0 : -1;
}

const PROPERTY_TYPE_OPTIONS = [
	['automatic', '自动类型'],
	['text', '文本'],
	['multitext', '列表'],
	['number', '数字'],
	['checkbox', '复选框'],
	['date', '日期'],
	['datetime', '日期时间'],
] as const;

function normalizePropertyName(value: string): string {
	return value.trim();
}

function isReservedPropertyName(value: string): boolean {
	return ['aliases', 'tags', 'cssclasses'].includes(value.toLocaleLowerCase());
}

function isFrontmatterValueType(value: string): value is FrontmatterValueType {
	return ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'].includes(value);
}

function normalizeFrontmatterValueType(value?: string): FrontmatterValueType | null {
	if (!value) return null;
	if (value === 'aliases' || value === 'tags') return 'multitext';
	return isFrontmatterValueType(value) ? value : null;
}

function getMetadataTypeManager(app: App): InternalMetadataTypeManager | null {
	const manager = (app as InternalApp).metadataTypeManager;
	return manager &&
		typeof manager.getAssignedWidget === 'function' &&
		typeof manager.getTypeInfo === 'function' &&
		typeof manager.setType === 'function'
		? manager
		: null;
}

function createResultNotice(
	succeeded: number,
	failed: number,
	notAttempted: number,
	conflicts: number,
	skipped: number,
	typeUpdated: boolean,
): string {
	const parts = [`批量操作完成: 成功 ${succeeded} 个`];
	if (skipped > 0) parts.push(`无变化 ${skipped} 个`);
	if (conflicts > 0) parts.push(`预览冲突 ${conflicts} 个`);
	if (failed > 0) parts.push(`执行失败 ${failed} 个`);
	if (notAttempted > 0) parts.push(`未继续处理 ${notAttempted} 个`);
	if (typeUpdated) parts.push('属性类型已更新');
	return `${parts.join(', ')}.`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return '未知错误';
}

function isInternalController(value: unknown): value is InternalQueryController & {
	viewHeaderEl: HTMLElement;
} {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<InternalQueryController>;
	return (
		candidate.viewHeaderEl !== undefined &&
		candidate.viewHeaderEl.nodeType === Node.ELEMENT_NODE
	);
}
