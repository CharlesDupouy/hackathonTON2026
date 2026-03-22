class_name score_shower
extends Node

@export var vbox_pack: PackedScene

func _ready() -> void:
	SignalBus.score_breakdown.connect(func(x): display(
		%FishingRod.get_global_floater_postion(),
		x
	))

func display(pos: Vector2, scores: Array[int]) -> void:
	var pop: NumbrePopUp = vbox_pack.instantiate()
	add_child(pop)
	pop.display(pos, scores)
