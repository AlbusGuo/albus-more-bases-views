import type { App, ListItemCache, TFile } from 'obsidian';

export interface ProjectTask {
	line: number;
	parentLine: number | null;
	status: string;
	text: string;
}

const TASK_LINE = /^(\s*)([-*+]|\d+[.)])\s+\[([^\]])\]\s*(.*)$/;

export async function readProjectTasks(
	app: App,
	file: TFile,
): Promise<ProjectTask[]> {
	const listItems = app.metadataCache.getFileCache(file)?.listItems ?? [];
	const taskItems = listItems.filter(
		(item): item is ListItemCache & { task: string } => item.task !== undefined,
	);
	if (taskItems.length === 0) return [];
	const lines = (await app.vault.cachedRead(file)).split(/\r?\n/);
	const taskLines = new Set(taskItems.map((item) => item.position.start.line));
	return taskItems.flatMap((item) => {
		const line = item.position.start.line;
		const match = lines[line]?.match(TASK_LINE);
		if (!match) return [];
		return [{
			line,
			parentLine: taskLines.has(item.parent) ? item.parent : null,
			status: match[3] ?? item.task,
			text: match[4]?.trim() ?? '',
		}];
	});
}

export async function toggleProjectTask(
	app: App,
	file: TFile,
	task: ProjectTask,
): Promise<void> {
	await updateTaskLine(app, file, task.line, (match) => {
		const next = task.status === ' ' ? 'x' : ' ';
		return `${match[1]}${match[2]} [${next}] ${match[4] ?? ''}`;
	});
}

export async function renameProjectTask(
	app: App,
	file: TFile,
	task: ProjectTask,
	text: string,
): Promise<void> {
	await updateTaskLine(app, file, task.line, (match) =>
		`${match[1]}${match[2]} [${match[3]}] ${text.replace(/\s*\n\s*/g, ' ').trim()}`,
	);
}

export async function deleteProjectTask(
	app: App,
	file: TFile,
	task: ProjectTask,
): Promise<void> {
	await app.vault.process(file, (data) => {
		const eol = data.includes('\r\n') ? '\r\n' : '\n';
		const lines = data.split(/\r?\n/);
		if (!lines[task.line]?.match(TASK_LINE)) return data;
		lines.splice(task.line, 1);
		return lines.join(eol);
	});
}

export async function addProjectTask(
	app: App,
	file: TFile,
	text: string,
): Promise<number> {
	const taskText = text.replace(/\s*\n\s*/g, ' ').trim();
	if (!taskText) return -1;
	let appendedLine = -1;
	await app.vault.process(file, (data) => {
		const eol = data.includes('\r\n') ? '\r\n' : '\n';
		appendedLine = data.length === 0 ? 0 : data.split(/\r?\n/).length;
		if (data.endsWith('\n')) appendedLine -= 1;
		const separator = data.length === 0 || data.endsWith('\n') ? '' : eol;
		return `${data}${separator}- [ ] ${taskText}${eol}`;
	});
	return appendedLine;
}

async function updateTaskLine(
	app: App,
	file: TFile,
	lineNumber: number,
	update: (match: RegExpMatchArray) => string,
): Promise<void> {
	await app.vault.process(file, (data) => {
		const eol = data.includes('\r\n') ? '\r\n' : '\n';
		const lines = data.split(/\r?\n/);
		const match = lines[lineNumber]?.match(TASK_LINE);
		if (!match) return data;
		lines[lineNumber] = update(match);
		return lines.join(eol);
	});
}
