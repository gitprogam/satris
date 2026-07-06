class_name MiniPieceView
extends Node2D

var piece_type = null
var box_width: float = 150.0
var box_height: float = 84.0
var cell_size: float = 20.0
var dimmed := false

func _draw() -> void:
	draw_rect(Rect2(0, 0, box_width, box_height), Color8(21, 21, 31))
	draw_rect(Rect2(0, 0, box_width, box_height), Color8(51, 51, 74), false, 2.0)

	if piece_type == null:
		return

	var shape: Array = Pieces.PIECE_SHAPES[piece_type][0]
	var min_r := 999
	var max_r := -999
	var min_c := 999
	var max_c := -999
	for cell in shape:
		min_r = min(min_r, cell[0])
		max_r = max(max_r, cell[0])
		min_c = min(min_c, cell[1])
		max_c = max(max_c, cell[1])

	var w := (max_c - min_c + 1) * cell_size
	var h := (max_r - min_r + 1) * cell_size
	var offset_x := (box_width - w) / 2.0
	var offset_y := (box_height - h) / 2.0

	var alpha := 0.4 if dimmed else 1.0
	var base_color: Color = GameConstants.PIECE_COLORS[piece_type]
	var color := Color(base_color.r, base_color.g, base_color.b, alpha)

	for cell in shape:
		var x: float = offset_x + (cell[1] - min_c) * cell_size
		var y: float = offset_y + (cell[0] - min_r) * cell_size
		draw_rect(Rect2(x + 1, y + 1, cell_size - 2, cell_size - 2), color)

func set_piece(type, is_dimmed: bool = false) -> void:
	piece_type = type
	dimmed = is_dimmed
	queue_redraw()
