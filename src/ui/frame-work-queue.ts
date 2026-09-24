/** Shared per-view budget for deferred raster work. */
export class FrameWorkQueue {
	private readonly work = new Map<number, () => void>();
	private sequence = 0;
	private frame: number | null = null;
	private disposed = false;
	constructor(private readonly window: Window) {}
	add(callback: () => void): () => void {
		if (this.disposed) return () => {};
		const id = ++this.sequence; this.work.set(id, callback); this.schedule();
		return () => { this.work.delete(id); };
	}
	destroy(): void {
		this.disposed = true; this.work.clear();
		if (this.frame !== null) this.window.cancelAnimationFrame(this.frame); this.frame = null;
	}
	private schedule(): void {
		if (this.frame !== null || this.disposed) return;
		this.frame = this.window.requestAnimationFrame(() => {
			this.frame = null; const start = this.window.performance.now();
			for (const [id, callback] of this.work) {
				this.work.delete(id); callback();
				if (this.window.performance.now() - start >= 6) break;
			}
			if (this.work.size) this.schedule();
		});
	}
}
