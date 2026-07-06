class_name ActivePiece
extends RefCounted

var type: String
var rotation: int
var row: int
var col: int

func _init(p_type: String = "", p_rotation: int = 0, p_row: int = 0, p_col: int = 0) -> void:
	type = p_type
	rotation = p_rotation
	row = p_row
	col = p_col

func clone() -> ActivePiece:
	return ActivePiece.new(type, rotation, row, col)
