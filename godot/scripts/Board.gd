class_name Board
extends RefCounted

var grid: Array = []

func _init() -> void:
	reset()

func reset() -> void:
	grid = []
	for r in range(GameConstants.TOTAL_ROWS):
		var row := []
		for c in range(GameConstants.COLS):
			row.append(null)
		grid.append(row)

func is_cell_free(row: int, col: int) -> bool:
	if col < 0 or col >= GameConstants.COLS:
		return false
	if row >= GameConstants.TOTAL_ROWS:
		return false
	if row < 0:
		return true
	return grid[row][col] == null

func lock_cells(cells: Array, type: String) -> void:
	for cell in cells:
		var r: int = cell[0]
		var c: int = cell[1]
		if r >= 0 and r < GameConstants.TOTAL_ROWS and c >= 0 and c < GameConstants.COLS:
			grid[r][c] = type

# 꽉 찬 줄을 찾아 제거하고, 제거된 줄의 인덱스 목록을 반환
func clear_lines() -> Array:
	var full_rows := []
	for r in range(GameConstants.TOTAL_ROWS):
		var full := true
		for c in range(GameConstants.COLS):
			if grid[r][c] == null:
				full = false
				break
		if full:
			full_rows.append(r)

	if full_rows.is_empty():
		return []

	var new_grid := []
	for i in range(full_rows.size()):
		var empty_row := []
		for c in range(GameConstants.COLS):
			empty_row.append(null)
		new_grid.append(empty_row)

	for r in range(GameConstants.TOTAL_ROWS):
		if not full_rows.has(r):
			new_grid.append(grid[r])

	grid = new_grid
	return full_rows
