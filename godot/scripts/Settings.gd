class_name Settings
extends RefCounted

const DEFAULTS := {
	"das": 133.0, # Delayed Auto Shift (ms)
	"arr": 2.0,   # Auto Repeat Rate (ms)
	"sdf": 20.0,  # Soft Drop Factor (5~41, 41=즉시 바닥까지)
	"dcd": 0.0,   # DAS Cut Delay (ms)
}

const LIMITS := {
	"das": {"min": 0.0, "max": 500.0},
	"arr": {"min": 0.0, "max": 100.0},
	"sdf": {"min": 5.0, "max": 41.0},
	"dcd": {"min": 0.0, "max": 300.0},
}

const CONFIG_PATH := "user://settings.cfg"
const SECTION := "handling"

static func load_settings() -> Dictionary:
	var config := ConfigFile.new()
	var result := DEFAULTS.duplicate()
	if config.load(CONFIG_PATH) == OK:
		for key in DEFAULTS.keys():
			result[key] = config.get_value(SECTION, key, DEFAULTS[key])
	return result

static func save_settings(settings: Dictionary) -> void:
	var config := ConfigFile.new()
	for key in DEFAULTS.keys():
		if settings.has(key):
			config.set_value(SECTION, key, settings[key])
	config.save(CONFIG_PATH)
