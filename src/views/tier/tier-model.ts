export type MainTierName =
	| '夯'
	| '顶级'
	| '人上人'
	| 'NPC'
	| '拉完了'
	| '待品鉴';

export interface TierInfo {
	name: MainTierName;
	className: string;
	color: string;
	range: string;
	maxScore: number | null;
	score: number;
}

export interface TierRowDefinition {
	name: string;
	className: string;
	color: string;
	range: string;
	minScore: number | null;
	maxScore: number | null;
	parent?: MainTierName;
}

export const MAIN_TIERS: readonly TierRowDefinition[] = [
	{ name: '夯', className: 'is-hang', color: '#ff2d55', range: '9.1 - 10.0', minScore: 9.1, maxScore: 10 },
	{ name: '顶级', className: 'is-top', color: '#ff9500', range: '8.1 - 9.0', minScore: 8.1, maxScore: 9 },
	{ name: '人上人', className: 'is-above', color: '#34c759', range: '7.1 - 8.0', minScore: 7.1, maxScore: 8 },
	{ name: 'NPC', className: 'is-npc', color: '#007aff', range: '6.1 - 7.0', minScore: 6.1, maxScore: 7 },
	{ name: '拉完了', className: 'is-trash', color: '#8e8e93', range: '≤ 6.0', minScore: 0, maxScore: 6 },
	{ name: '待品鉴', className: 'is-none', color: '#555555', range: '-', minScore: null, maxScore: null },
];

const SUB_BANDS: Record<Exclude<MainTierName, '待品鉴'>, readonly [number, number][]> = {
	夯: [[9.9, 10], [9.7, 9.8], [9.5, 9.6], [9.3, 9.4], [9.1, 9.2]],
	顶级: [[8.9, 9], [8.7, 8.8], [8.5, 8.6], [8.3, 8.4], [8.1, 8.2]],
	人上人: [[7.9, 8], [7.7, 7.8], [7.5, 7.6], [7.3, 7.4], [7.1, 7.2]],
	NPC: [[6.9, 7], [6.7, 6.8], [6.5, 6.6], [6.3, 6.4], [6.1, 6.2]],
	拉完了: [[4.8, 6], [3.6, 4.7], [2.4, 3.5], [1.2, 2.3], [0, 1.1]],
};

const SUB_NAMES: Record<Exclude<MainTierName, '待品鉴'>, readonly string[]> = {
	夯: ['夯中夯', '大夯', '小夯', '微夯', '擦边夯'],
	顶级: ['顶中顶', '准顶', '亚顶', '次顶', '摸顶'],
	人上人: ['人皇', '人杰', '人才', '人物', '像个人'],
	NPC: ['路人王', '有点东西', '及格线', '勉强过关', '差点意思'],
	拉完了: ['还有救', '能忍', '坐牢', '折磨', '依托答辩'],
};

export function getTierInfo(value: string): TierInfo {
	const score = Number.parseFloat(value);
	const definition = Number.isFinite(score) && score >= 0
		? MAIN_TIERS.find((tier) => tier.minScore !== null && score >= tier.minScore)
		: undefined;
	const tier = definition ?? MAIN_TIERS[MAIN_TIERS.length - 1];
	if (!tier) throw new Error('评价档位定义为空.');
	return {
		name: tier.name as MainTierName,
		className: tier.className,
		color: tier.color,
		range: tier.range,
		maxScore: tier.maxScore,
		score: definition ? score : 0,
	};
}

export function getSubTiers(parent: MainTierName): TierRowDefinition[] {
	if (parent === '待品鉴') return [];
	const main = MAIN_TIERS.find((tier) => tier.name === parent);
	if (!main) return [];
	return SUB_BANDS[parent].map(([minScore, maxScore], index) => ({
		name: SUB_NAMES[parent][index] ?? `${minScore.toFixed(1)} - ${maxScore.toFixed(1)}`,
		className: 'is-drill',
		color: mixWithGray(main.color, index / 4),
		range: parent === '拉完了' && index === 4
			? `≤ ${maxScore.toFixed(1)}`
			: `${minScore.toFixed(1)} - ${maxScore.toFixed(1)}`,
		minScore,
		maxScore,
		parent,
	}));
}

export function getSubTierForScore(
	parent: MainTierName,
	score: number,
): TierRowDefinition | null {
	return getSubTiers(parent).find((tier) =>
		tier.minScore !== null && tier.maxScore !== null &&
		score >= tier.minScore && score <= tier.maxScore,
	) ?? null;
}

function mixWithGray(color: string, position: number): string {
	const channels = [1, 3, 5].map((offset) =>
		Number.parseInt(color.slice(offset, offset + 2), 16),
	);
	const gray = 0x55 + Math.round(position * 0x55);
	return `#${channels.map((channel) => {
		const mixed = Math.round((channel ?? gray) + (gray - (channel ?? gray)) * position * 0.6);
		return mixed.toString(16).padStart(2, '0');
	}).join('')}`;
}
