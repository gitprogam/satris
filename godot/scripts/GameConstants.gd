class_name GameConstants
extends RefCounted

const COLS := 10
const VISIBLE_ROWS := 20
const BUFFER_ROWS := 20
const TOTAL_ROWS := VISIBLE_ROWS + BUFFER_ROWS
const CELL_SIZE := 32.0

const PIECE_COLORS := {
	"I": Color8(49, 199, 239),
	"O": Color8(247, 211, 8),
	"T": Color8(173, 77, 156),
	"S": Color8(66, 182, 66),
	"Z": Color8(239, 32, 41),
	"J": Color8(90, 101, 173),
	"L": Color8(239, 121, 33),
}

const GHOST_ALPHA := 0.25

const DEFAULT_DAS := 133.0
const DEFAULT_ARR := 2.0
const SOFT_DROP_FACTOR := 20.0
const LOCK_DELAY := 500.0
const MAX_LOCK_RESETS := 15
const LINES_PER_LEVEL := 10

# 레벨별 중력 (한 칸 내려가는데 걸리는 ms) - Guideline 근사 공식
static func gravity_for_level(level: int) -> float:
	var base := 0.8 - (level - 1) * 0.007
	var exponent := level - 1
	var seconds := 1.0
	for i in range(exponent):
		seconds *= base
	return max(seconds * 1000.0, 16.67)
