class_name BoardView
extends Node2D

var engine: GameEngine = null

func _draw() -> void:
	if engine == null:
		return

	var board_w := GameConstants.COLS * GameConstants.CELL_SIZE
	var board_h := GameConstants.VISIBLE_ROWS * GameConstants.CELL_SIZE

	draw_rect(Rect2(0, 0, board_w, board_h), Color8(10, 10, 18))

	for c in range(1, GameConstants.COLS):
		var x := c * GameConstants.CELL_SIZE
		draw_line(Vector2(x, 0), Vector2(x, board_h), Color8(36, 36, 58))
	for r in range(1, GameConstants.VISIBLE_ROWS):
		var y := r * GameConstants.CELL_SIZE
		draw_line(Vector2(0, y), Vector2(board_w, y), Color8(36, 36, 58))

	draw_rect(Rect2(0, 0, board_w, board_h), Color8(74, 74, 106), false, 2.0)

	# 고정된 셀
	for row in range(GameConstants.BUFFER_ROWS, GameConstants.TOTAL_ROWS):
		for col in range(GameConstants.COLS):
			var cell = engine.board.grid[row][col]
			if cell != null:
				_draw_cell(col * GameConstants.CELL_SIZE, (row - GameConstants.BUFFER_ROWS) * GameConstants.CELL_SIZE, GameConstants.PIECE_COLORS[cell], 1.0)

	if engine.active != null and not engine.game_over:
		var color: Color = GameConstants.PIECE_COLORS[engine.active.type]

		for cell in engine.get_ghost_cells():
			var vr: int = cell[0] - GameConstants.BUFFER_ROWS
			if vr >= 0:
				_draw_cell(cell[1] * GameConstants.CELL_SIZE, vr * GameConstants.CELL_SIZE, color, GameConstants.GHOST_ALPHA)

		for cell in engine.get_active_cells():
			var vr: int = cell[0] - GameConstants.BUFFER_ROWS
			if vr >= 0:
				_draw_cell(cell[1] * GameConstants.CELL_SIZE, vr * GameConstants.CELL_SIZE, color, 1.0)

func _draw_cell(x: float, y: float, color: Color, alpha: float) -> void:
	var pad := 1.5
	var size := GameConstants.CELL_SIZE
	var fill_color := Color(color.r, color.g, color.b, alpha)
	draw_rect(Rect2(x + pad, y + pad, size - pad * 2, size - pad * 2), fill_color)
	var highlight := Color(1, 1, 1, alpha * 0.18)
	draw_rect(Rect2(x + pad * 2, y + pad * 2, size - pad * 4, size * 0.32), highlight)
