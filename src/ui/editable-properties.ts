import {
	Notice,
	NullValue,
	parsePropertyId,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';

export interface EditablePropertyContext {
	app: App;
	entry: BasesEntry;
	visibleProperties: BasesPropertyId[];
}

export interface EditablePropertyClasses {
	body: string;
	title: string;
	list: string;
	property: string;
	editable: string;
}

interface EditablePropertyNode {
	element: HTMLElement;
	propertyName: string | null;
	context: EditablePropertyContext;
	renderSignature: string;
	suppressBlur: boolean;
}

interface EditablePropertiesState {
	bodyEl: HTMLElement;
	propertiesEl: HTMLElement;
	nodes: Map<BasesPropertyId, EditablePropertyNode>;
}

const editablePropertiesStates = new WeakMap<HTMLElement, EditablePropertiesState>();

export function getVisiblePropertyTitle(
	context: EditablePropertyContext,
): string {
	const property = context.visibleProperties[0];
	if (!property) return '';
	return getValueText(context.entry.getValue(property));
}

export function getVisiblePropertiesSignature(
	context: EditablePropertyContext,
): string {
	return context.visibleProperties
		.map((property) => {
			const value = context.entry.getValue(property);
			return `${property}\u0000${getValueText(value)}`;
		})
		.join('\u0001');
}

export function updateEditableProperties(
	cardEl: HTMLElement,
	context: EditablePropertyContext,
	classes: EditablePropertyClasses,
): void {
	const state = getOrCreateState(cardEl, context, classes);
	const [titleProperty, ...detailProperties] = context.visibleProperties;
	const titleValue = titleProperty
		? context.entry.getValue(titleProperty)
		: null;
	const hasTitle = Boolean(titleProperty) && getValueText(titleValue).length > 0;
	const visibleProperties = new Set<BasesPropertyId>(detailProperties);
	if (hasTitle && titleProperty) visibleProperties.add(titleProperty);

	for (const [property, node] of state.nodes) {
		if (visibleProperties.has(property)) continue;
		detachNode(node);
		state.nodes.delete(property);
	}

	if (!hasTitle && detailProperties.length === 0) {
		state.bodyEl.remove();
		return;
	}
	if (state.bodyEl.parentElement !== cardEl) cardEl.appendChild(state.bodyEl);

	let titleNode: EditablePropertyNode | null = null;
	if (hasTitle && titleProperty) {
		titleNode = getOrCreateNode(state, titleProperty, context, classes);
		updateNode(titleNode, context, classes, titleValue, true);
		placeChild(state.bodyEl, titleNode.element, state.bodyEl.firstChild);
	}
	if (detailProperties.length === 0) {
		state.propertiesEl.remove();
		return;
	}
	const listAnchor = titleNode?.element.nextSibling ?? state.bodyEl.firstChild;
	placeChild(state.bodyEl, state.propertiesEl, listAnchor);
	let propertyAnchor = state.propertiesEl.firstChild;
	for (const property of detailProperties) {
		const node = getOrCreateNode(state, property, context, classes);
		updateNode(
			node,
			context,
			classes,
			context.entry.getValue(property),
			false,
		);
		placeChild(state.propertiesEl, node.element, propertyAnchor);
		propertyAnchor = node.element.nextSibling;
	}
}

function getOrCreateState(
	cardEl: HTMLElement,
	context: EditablePropertyContext,
	classes: EditablePropertyClasses,
): EditablePropertiesState {
	const current = editablePropertiesStates.get(cardEl);
	if (current) return current;
	const bodyEl = cardEl.createDiv(classes.body);
	const state: EditablePropertiesState = {
		bodyEl,
		propertiesEl: bodyEl.createDiv(classes.list),
		nodes: new Map(),
	};
	editablePropertiesStates.set(cardEl, state);
	if (context.visibleProperties.length === 0) bodyEl.remove();
	return state;
}

function getOrCreateNode(
	state: EditablePropertiesState,
	property: BasesPropertyId,
	context: EditablePropertyContext,
	classes: EditablePropertyClasses,
): EditablePropertyNode {
	const current = state.nodes.get(property);
	if (current) return current;
	const parsedProperty = parsePropertyId(property);
	const node: EditablePropertyNode = {
		element: createDiv(),
		propertyName: parsedProperty.type === 'note' ? parsedProperty.name : null,
		context,
		renderSignature: '',
		suppressBlur: false,
	};
	if (node.propertyName) bindEditableNode(node, classes);
	state.nodes.set(property, node);
	return node;
}

function updateNode(
	node: EditablePropertyNode,
	context: EditablePropertyContext,
	classes: EditablePropertyClasses,
	value: Value | null,
	isTitle: boolean,
): void {
	node.context = context;
	node.element.classList.toggle(classes.title, isTitle);
	node.element.classList.toggle(classes.property, !isTitle);
	node.element.classList.toggle(classes.editable, node.propertyName !== null);
	const text = getValueText(value);
	node.element.dataset.empty = String(text.length === 0);
	if (node.propertyName) {
		if (node.element.contentEditable === 'true') return;
		if (node.element.dataset.originalText === text) return;
		node.element.dataset.originalText = text;
		node.element.setText(text);
		return;
	}

	const signature = `${value?.constructor.name ?? ''}\u0000${text}`;
	if (signature === node.renderSignature) return;
	node.renderSignature = signature;
	node.element.empty();
	if (value && text) value.renderTo(node.element, context.app.renderContext);
}

function bindEditableNode(
	node: EditablePropertyNode,
	classes: EditablePropertyClasses,
): void {
	const valueEl = node.element;
	valueEl.addClass(classes.editable);
	valueEl.contentEditable = 'false';
	valueEl.addEventListener('click', (event) => {
		event.stopPropagation();
		const wasEditing = valueEl.contentEditable === 'true';
		valueEl.contentEditable = 'true';
		valueEl.focus();
		if (!wasEditing) placeCaretAtEnd(valueEl);
	});
	valueEl.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		valueEl.blur();
	});
	valueEl.addEventListener('blur', () => {
		valueEl.contentEditable = 'false';
		if (node.suppressBlur) return;
		const propertyName = node.propertyName;
		if (!propertyName) return;
		const nextValue = valueEl.textContent?.trim() ?? '';
		valueEl.dataset.empty = String(nextValue.length === 0);
		const previousValue = valueEl.dataset.originalText ?? '';
		if (nextValue === previousValue) return;
		const { app, entry } = node.context;
		void app.fileManager
			.processFrontMatter(entry.file, (frontmatter) => {
				const writableFrontmatter = frontmatter as Record<string, unknown>;
				writableFrontmatter[propertyName] = nextValue;
			})
			.then(() => {
				valueEl.dataset.originalText = nextValue;
			})
			.catch(() => {
				valueEl.setText(previousValue);
				valueEl.dataset.empty = String(previousValue.length === 0);
				new Notice('更新属性失败.');
			});
	});
}

function detachNode(node: EditablePropertyNode): void {
	if (node.element.contentEditable !== 'true') {
		node.element.remove();
		return;
	}
	node.suppressBlur = true;
	node.element.contentEditable = 'false';
	node.element.remove();
	queueMicrotask(() => {
		node.suppressBlur = false;
	});
}

function placeChild(
	parent: HTMLElement,
	child: HTMLElement,
	anchor: ChildNode | null,
): void {
	if (child === anchor) return;
	parent.insertBefore(child, anchor);
}

function getValueText(value: Value | null): string {
	if (value === null || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function placeCaretAtEnd(element: HTMLElement): void {
	const selection = element.ownerDocument.getSelection();
	if (!selection) return;
	const range = element.ownerDocument.createRange();
	range.selectNodeContents(element);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}
