class_name SettingsPanel
extends Control

signal closed

var engine: GameEngine
var das_edit: LineEdit
var arr_edit: LineEdit
var sdf_edit: LineEdit
var dcd_edit: LineEdit

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.5)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(320, 0)
	add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	panel.add_child(vbox)

	var title := Label.new()
	title.text = "설정 (Tab으로 열고 닫기)"
	title.add_theme_font_size_override("font_size", 18)
	vbox.add_child(title)

	das_edit = _add_field(vbox, "DAS - Delayed Auto Shift (ms)")
	arr_edit = _add_field(vbox, "ARR - Auto Repeat Rate (ms)")
	sdf_edit = _add_field(vbox, "SDF - Soft Drop Factor (5~41, 41=즉시)")
	dcd_edit = _add_field(vbox, "DCD - DAS Cut Delay (ms)")

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	vbox.add_child(hbox)

	var reset_btn := Button.new()
	reset_btn.text = "기본값으로"
	reset_btn.pressed.connect(_on_reset)
	hbox.add_child(reset_btn)

	var close_btn := Button.new()
	close_btn.text = "닫기"
	close_btn.pressed.connect(func(): closed.emit())
	hbox.add_child(close_btn)

	visible = false

func _add_field(parent: Node, label_text: String) -> LineEdit:
	var label := Label.new()
	label.text = label_text
	label.add_theme_font_size_override("font_size", 12)
	parent.add_child(label)
	var edit := LineEdit.new()
	edit.text_changed.connect(func(_t): _apply())
	parent.add_child(edit)
	return edit

func open_with(current_engine: GameEngine) -> void:
	engine = current_engine
	das_edit.text = str(engine.das)
	arr_edit.text = str(engine.arr)
	sdf_edit.text = str(engine.sdf)
	dcd_edit.text = str(engine.dcd)
	visible = true
	das_edit.grab_focus()

func _on_reset() -> void:
	das_edit.text = str(Settings.DEFAULTS["das"])
	arr_edit.text = str(Settings.DEFAULTS["arr"])
	sdf_edit.text = str(Settings.DEFAULTS["sdf"])
	dcd_edit.text = str(Settings.DEFAULTS["dcd"])
	_apply()

func _apply() -> void:
	if engine == null:
		return
	var settings := {
		"das": das_edit.text.to_float(),
		"arr": arr_edit.text.to_float(),
		"sdf": clampf(sdf_edit.text.to_float(), Settings.LIMITS["sdf"]["min"], Settings.LIMITS["sdf"]["max"]),
		"dcd": dcd_edit.text.to_float(),
	}
	engine.apply_settings(settings)
	Settings.save_settings(settings)
