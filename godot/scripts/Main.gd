extends Node2D

const SIDE_PANEL_W := 170.0
const MARGIN := 24.0

const CLEAR_LABELS := {
	"single": "SINGLE",
	"double": "DOUBLE",
	"triple": "TRIPLE",
	"tetris": "TETRIS",
	"tspin": "T-SPIN",
	"tspin-mini": "T-SPIN MINI",
	"tspin-single": "T-SPIN SINGLE",
	"tspin-mini-single": "T-SPIN MINI SINGLE",
	"tspin-double": "T-SPIN DOUBLE",
	"tspin-triple": "T-SPIN TRIPLE",
}

var engine: GameEngine
var board_view: BoardView
var hold_view: MiniPieceView
var next_views: Array = []

var score_label: Label
var level_label: Label
var lines_label: Label
var combo_label: Label
var clear_label: Label

var overlay: ColorRect
var overlay_label: Label
var overlay_sub_label: Label

var clear_msg_timer := 0.0
var last_clear_id := -1

var held_keys := {}
var dir_stack := []

func _ready() -> void:
	engine = GameEngine.new()

	var board_w := GameConstants.COLS * GameConstants.CELL_SIZE
	var board_h := GameConstants.VISIBLE_ROWS * GameConstants.CELL_SIZE

	board_view = BoardView.new()
	board_view.engine = engine
	board_view.position = Vector2(SIDE_PANEL_W + MARGIN, 0)
	add_child(board_view)

	_build_side_panels(board_w, board_h)
	_build_overlay(board_w, board_h)

func _label(text: String, pos: Vector2, color := Color(0.82, 0.82, 0.91), size := 15) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	l.add_theme_color_override("font_color", color)
	l.add_theme_font_size_override("font_size", size)
	add_child(l)
	return l

func _build_side_panels(board_w: float, board_h: float) -> void:
	var label_color := Color(0.56, 0.56, 0.69)

	_label("HOLD", Vector2(0, 0), label_color, 14)
	hold_view = MiniPieceView.new()
	hold_view.box_width = SIDE_PANEL_W - 20
	hold_view.box_height = 90
	hold_view.position = Vector2(0, 28)
	add_child(hold_view)

	_label("SCORE", Vector2(0, 150), label_color, 12)
	score_label = _label("0", Vector2(0, 172))

	_label("LEVEL", Vector2(0, 210), label_color, 12)
	level_label = _label("1", Vector2(0, 232))

	_label("LINES", Vector2(0, 270), label_color, 12)
	lines_label = _label("0", Vector2(0, 292))

	combo_label = _label("", Vector2(0, 330), Color8(255, 213, 74), 14)

	var next_x := SIDE_PANEL_W + MARGIN + board_w + MARGIN
	_label("NEXT", Vector2(next_x, 0), label_color, 14)

	for i in range(5):
		var mv := MiniPieceView.new()
		mv.box_width = SIDE_PANEL_W - 20
		mv.box_height = 80
		mv.cell_size = 18
		mv.position = Vector2(next_x, 28 + i * 84)
		add_child(mv)
		next_views.append(mv)

	clear_label = _label("", board_view.position + Vector2(board_w / 2.0 - 100, 12), Color8(255, 224, 102), 20)
	clear_label.custom_minimum_size = Vector2(200, 30)
	clear_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func _build_overlay(board_w: float, board_h: float) -> void:
	overlay = ColorRect.new()
	overlay.color = Color(0, 0, 0, 0.7)
	overlay.size = Vector2(board_w, board_h)
	overlay.position = board_view.position
	overlay.visible = false
	add_child(overlay)

	overlay_label = _label("PAUSED", board_view.position + Vector2(board_w / 2.0 - 100, board_h / 2.0 - 40), Color.WHITE, 32)
	overlay_label.custom_minimum_size = Vector2(200, 40)
	overlay_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	overlay_label.visible = false

	overlay_sub_label = _label("", board_view.position + Vector2(board_w / 2.0 - 130, board_h / 2.0 + 10), Color(0.75, 0.75, 0.82), 16)
	overlay_sub_label.custom_minimum_size = Vector2(260, 24)
	overlay_sub_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	overlay_sub_label.visible = false

func _process(delta: float) -> void:
	var delta_ms := delta * 1000.0
	engine.update(delta_ms)
	_render(delta_ms)

func _render(delta_ms: float) -> void:
	board_view.queue_redraw()
	hold_view.set_piece(engine.hold_type, not engine.can_hold)

	var next: Array = engine.next_queue()
	for i in range(next_views.size()):
		if i < next.size():
			next_views[i].set_piece(next[i])
		else:
			next_views[i].set_piece(null)

	score_label.text = str(engine.score)
	level_label.text = str(engine.level)
	lines_label.text = str(engine.lines)
	combo_label.text = ("%d COMBO" % engine.combo) if engine.combo > 0 else ""

	if engine.last_clear != null and engine.last_clear["id"] != last_clear_id:
		last_clear_id = engine.last_clear["id"]
		var label_text: String = CLEAR_LABELS[engine.last_clear["type"]]
		if engine.last_clear["back_to_back"]:
			label_text = "B2B " + label_text
		clear_label.text = label_text
		clear_label.modulate.a = 1.0
		clear_msg_timer = 1100.0

	if clear_msg_timer > 0:
		clear_msg_timer -= delta_ms
		clear_label.modulate.a = max(0.0, clear_msg_timer / 1100.0)

	if engine.game_over:
		overlay.visible = true
		overlay_label.visible = true
		overlay_sub_label.visible = true
		overlay_label.text = "GAME OVER"
		overlay_sub_label.text = "R 키를 눌러 재시작"
	elif engine.paused:
		overlay.visible = true
		overlay_label.visible = true
		overlay_sub_label.visible = true
		overlay_label.text = "PAUSED"
		overlay_sub_label.text = "ESC 또는 P 키를 눌러 계속하기"
	else:
		overlay.visible = false
		overlay_label.visible = false
		overlay_sub_label.visible = false

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey:
		if event.pressed and not event.echo:
			_key_down(event.physical_keycode)
		elif not event.pressed:
			_key_up(event.physical_keycode)

func _key_down(key: int) -> void:
	if held_keys.has(key):
		return
	held_keys[key] = true

	match key:
		KEY_LEFT, KEY_A:
			_push_dir("left")
		KEY_RIGHT, KEY_D:
			_push_dir("right")
		KEY_DOWN, KEY_S:
			engine.set_soft_drop(true)
		KEY_UP, KEY_X:
			engine.rotate(1)
		KEY_Z, KEY_CTRL:
			engine.rotate(-1)
		KEY_F:
			engine.rotate180()
		KEY_SPACE:
			engine.hard_drop()
		KEY_C, KEY_SHIFT:
			engine.hold()
		KEY_ESCAPE, KEY_P:
			if not engine.game_over:
				engine.paused = not engine.paused
		KEY_R:
			if engine.game_over:
				engine.reset()
				last_clear_id = -1

func _key_up(key: int) -> void:
	held_keys.erase(key)
	match key:
		KEY_LEFT, KEY_A:
			_pop_dir("left")
		KEY_RIGHT, KEY_D:
			_pop_dir("right")
		KEY_DOWN, KEY_S:
			engine.set_soft_drop(false)

func _push_dir(dir: String) -> void:
	dir_stack.erase(dir)
	dir_stack.append(dir)
	engine.set_input(dir)

func _pop_dir(dir: String) -> void:
	dir_stack.erase(dir)
	var top = null
	if dir_stack.size() > 0:
		top = dir_stack[dir_stack.size() - 1]
	engine.set_input(top)
