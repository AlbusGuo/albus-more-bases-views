export class AnimationFrameTask {
	private frame: number | null = null;
	private frameWindow: Window | null = null;

	constructor(
		private readonly element: HTMLElement,
		private readonly callback: () => void,
	) {}

	schedule(): void {
		if (this.frame !== null) return;
		const ownerWindow = this.element.ownerDocument.defaultView;
		if (!ownerWindow) {
			this.callback();
			return;
		}
		this.frameWindow = ownerWindow;
		this.frame = ownerWindow.requestAnimationFrame(() => {
			this.frame = null;
			this.frameWindow = null;
			this.callback();
		});
	}

	cancel(): void {
		if (this.frame === null) return;
		this.frameWindow?.cancelAnimationFrame(this.frame);
		this.frame = null;
		this.frameWindow = null;
	}
}
