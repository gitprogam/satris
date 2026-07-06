class_name SevenBag
extends RefCounted

var queue: Array = []

func _refill() -> void:
	var bag: Array = Pieces.ALL_PIECES.duplicate()
	bag.shuffle()
	queue.append_array(bag)

func next() -> String:
	if queue.is_empty():
		_refill()
	return queue.pop_front()

func peek(count: int) -> Array:
	while queue.size() < count:
		_refill()
	return queue.slice(0, count)
