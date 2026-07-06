class_name GameEngine
extends RefCounted

const NEXT_PREVIEW := 5
const SPAWN_ROW := GameConstants.BUFFER_ROWS - 2
const SPAWN_COL := 3

var board: Board
var bag: SevenBag
var active: ActivePiece = null
var hold_type = null
var can_hold := true
var last_action_was_rotate := false
var last_kick_index := 0

var score := 0
var level := 1
var lines := 0
var combo := -1
var back_to_back := false

var game_over := false
var paused := false

var gravity_accum := 0.0
var lock_timer := 0.0
var lock_resets := 0
var is_grounded := false

var das_timer := {"left": 0.0, "right": 0.0}
var arr_timer := {"left": 0.0, "right": 0.0}
var held_dir = null

var das := GameConstants.DEFAULT_DAS
var arr := GameConstants.DEFAULT_ARR
var soft_drop_active := false

var last_clear = null
var clear_id_counter := 0

func _init() -> void:
	board = Board.new()
	bag = SevenBag.new()
	_spawn_next()

func reset() -> void:
	board.reset()
	bag = SevenBag.new()
	hold_type = null
	can_hold = true
	score = 0
	level = 1
	lines = 0
	combo = -1
	back_to_back = false
	game_over = false
	paused = false
	gravity_accum = 0.0
	lock_timer = 0.0
	lock_resets = 0
	is_grounded = false
	last_clear = null
	_spawn_next()

func next_queue() -> Array:
	return bag.peek(NEXT_PREVIEW)

func _get_cells(piece: ActivePiece) -> Array:
	var shape: Array = Pieces.PIECE_SHAPES[piece.type][piece.rotation]
	var cells := []
	for cell in shape:
		cells.append([cell[0] + piece.row, cell[1] + piece.col])
	return cells

func _can_place(piece: ActivePiece) -> bool:
	for cell in _get_cells(piece):
		if not board.is_cell_free(cell[0], cell[1]):
			return false
	return true

func _spawn_next() -> void:
	var type: String = bag.next()
	active = ActivePiece.new(type, 0, SPAWN_ROW, SPAWN_COL)
	can_hold = true
	gravity_accum = 0.0
	lock_timer = 0.0
	lock_resets = 0
	is_grounded = false
	last_action_was_rotate = false

	if not _can_place(active):
		game_over = true

func get_ghost_row() -> int:
	if active == null:
		return 0
	var test_row: int = active.row
	while true:
		var candidate := active.clone()
		candidate.row = test_row + 1
		if _can_place(candidate):
			test_row += 1
		else:
			break
	return test_row

func get_active_cells() -> Array:
	if active == null:
		return []
	return _get_cells(active)

func get_ghost_cells() -> Array:
	if active == null:
		return []
	var ghost_row := get_ghost_row()
	var shape: Array = Pieces.PIECE_SHAPES[active.type][active.rotation]
	var cells := []
	for cell in shape:
		cells.append([cell[0] + ghost_row, cell[1] + active.col])
	return cells

func _move(dx: int, dy: int) -> bool:
	if active == null or game_over or paused:
		return false
	var candidate := active.clone()
	candidate.row += dy
	candidate.col += dx
	if _can_place(candidate):
		active = candidate
		last_action_was_rotate = false
		_on_successful_move()
		return true
	return false

func move_left() -> void:
	_move(-1, 0)

func move_right() -> void:
	_move(1, 0)

func _on_successful_move() -> void:
	if is_grounded:
		if lock_resets < GameConstants.MAX_LOCK_RESETS:
			lock_timer = 0.0
			lock_resets += 1

func rotate(dir: int) -> void:
	if active == null or game_over or paused:
		return
	var from: int = active.rotation
	var to: int = posmod(from + dir, 4)
	var kicks := Pieces.get_kicks(active.type, from, to)
	for i in range(kicks.size()):
		var dx: int = kicks[i][0]
		var dy: int = kicks[i][1]
		var candidate := active.clone()
		candidate.rotation = to
		candidate.col += dx
		candidate.row += dy
		if _can_place(candidate):
			active = candidate
			last_action_was_rotate = true
			last_kick_index = i
			_on_successful_move()
			return

func rotate180() -> void:
	if active == null or game_over or paused:
		return
	var from: int = active.rotation
	var to: int = posmod(from + 2, 4)
	var kicks := Pieces.get_180_kicks(active.type, from)
	for i in range(kicks.size()):
		var dx: int = kicks[i][0]
		var dy: int = kicks[i][1]
		var candidate := active.clone()
		candidate.rotation = to
		candidate.col += dx
		candidate.row += dy
		if _can_place(candidate):
			active = candidate
			last_action_was_rotate = true
			last_kick_index = i
			_on_successful_move()
			return

func set_soft_drop(flag: bool) -> void:
	soft_drop_active = flag

func hard_drop() -> void:
	if active == null or game_over or paused:
		return
	var ghost_row := get_ghost_row()
	var drop_distance := ghost_row - active.row
	active.row = ghost_row
	score += drop_distance * 2
	_lock_piece()

func hold() -> void:
	if active == null or not can_hold or game_over or paused:
		return
	var current_type: String = active.type
	if hold_type == null:
		hold_type = current_type
		_spawn_next()
	else:
		var swap_type = hold_type
		hold_type = current_type
		active = ActivePiece.new(swap_type, 0, SPAWN_ROW, SPAWN_COL)
		gravity_accum = 0.0
		lock_timer = 0.0
		lock_resets = 0
		is_grounded = false
		last_action_was_rotate = false
	can_hold = false

func _detect_t_spin():
	if active == null or active.type != "T" or not last_action_was_rotate:
		return null
	var row: int = active.row
	var col: int = active.col
	var center_r := row + 1
	var center_c := col + 1
	var corners := [
		[center_r - 1, center_c - 1],
		[center_r - 1, center_c + 1],
		[center_r + 1, center_c - 1],
		[center_r + 1, center_c + 1],
	]
	var filled := []
	for c in corners:
		filled.append(not board.is_cell_free(c[0], c[1]))
	var filled_count := 0
	for f in filled:
		if f:
			filled_count += 1
	if filled_count < 3:
		return null

	# 전방 코너(회전 방향 기준 앞쪽 두 코너)가 둘 다 채워져 있으면 정식 T-spin
	var front_pairs := {0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2]}
	var pair: Array = front_pairs[active.rotation]
	var front_filled: bool = filled[pair[0]] and filled[pair[1]]
	if front_filled:
		return "full"
	if last_kick_index == 4:
		return "full"
	return "mini"

func _lock_piece() -> void:
	if active == null:
		return
	var tspin = _detect_t_spin()
	var cells := _get_cells(active)
	board.lock_cells(cells, active.type)
	var cleared_rows := board.clear_lines()
	var cleared_count := cleared_rows.size()

	_apply_scoring(cleared_count, tspin)

	active = null
	if not game_over:
		_spawn_next()

func _apply_scoring(cleared_count: int, tspin) -> void:
	var type = null
	var base := 0

	if tspin == "full":
		if cleared_count == 0:
			type = "tspin"
			base = 400
		elif cleared_count == 1:
			type = "tspin-single"
			base = 800
		elif cleared_count == 2:
			type = "tspin-double"
			base = 1200
		elif cleared_count == 3:
			type = "tspin-triple"
			base = 1600
	elif tspin == "mini":
		if cleared_count == 0:
			type = "tspin-mini"
			base = 100
		else:
			type = "tspin-mini-single"
			base = 200
	elif cleared_count > 0:
		if cleared_count == 1:
			type = "single"
			base = 100
		elif cleared_count == 2:
			type = "double"
			base = 300
		elif cleared_count == 3:
			type = "triple"
			base = 500
		elif cleared_count >= 4:
			type = "tetris"
			base = 800

	if cleared_count > 0:
		combo += 1
	else:
		combo = -1

	if type != null:
		var is_hard_type: bool = type == "tetris" or tspin != null
		var btb_bonus := 1.0
		if back_to_back and is_hard_type and cleared_count > 0:
			btb_bonus = 1.5
		var gained := int(floor(base * level * btb_bonus))
		if combo > 0:
			gained += 50 * combo * level
		score += gained

		if cleared_count > 0:
			back_to_back = is_hard_type

		last_clear = {
			"type": type,
			"lines": cleared_count,
			"back_to_back": back_to_back and is_hard_type,
			"combo": combo,
			"score": gained,
			"id": clear_id_counter,
		}
		clear_id_counter += 1

	if cleared_count > 0:
		lines += cleared_count
		var new_level := int(floor(lines / float(GameConstants.LINES_PER_LEVEL))) + 1
		if new_level != level:
			level = new_level

func set_input(dir) -> void:
	if held_dir != dir:
		held_dir = dir
		if dir != null:
			das_timer[dir] = 0.0
			arr_timer[dir] = 0.0
			_move(-1 if dir == "left" else 1, 0)

func update(delta_ms: float) -> void:
	if game_over or paused or active == null:
		return

	if held_dir != null:
		var dir = held_dir
		das_timer[dir] += delta_ms
		if das_timer[dir] >= das:
			arr_timer[dir] += delta_ms
			if arr <= 0:
				while _move(-1 if dir == "left" else 1, 0):
					pass
			else:
				while arr_timer[dir] >= arr:
					arr_timer[dir] -= arr
					if not _move(-1 if dir == "left" else 1, 0):
						break

	var base_gravity := GameConstants.gravity_for_level(level)
	var effective_gravity := base_gravity / GameConstants.SOFT_DROP_FACTOR if soft_drop_active else base_gravity

	gravity_accum += delta_ms
	while gravity_accum >= effective_gravity:
		gravity_accum -= effective_gravity
		var candidate := active.clone()
		candidate.row += 1
		if _can_place(candidate):
			active = candidate
			if soft_drop_active:
				score += 1
			is_grounded = false
			last_action_was_rotate = false
		else:
			is_grounded = true
			break

	if is_grounded:
		lock_timer += delta_ms
		if lock_timer >= GameConstants.LOCK_DELAY:
			_lock_piece()
