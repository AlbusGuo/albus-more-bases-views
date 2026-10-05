export function prepareEditorModal(
	titleEl: HTMLElement,
): void {
	const headerEl = titleEl.closest<HTMLElement>('.modal-header');
	if (headerEl) headerEl.remove();
	else titleEl.remove();
}
