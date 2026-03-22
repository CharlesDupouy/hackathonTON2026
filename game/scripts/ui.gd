class_name HUD
extends Control

@export var timer_label: Label
@export var score_label: Label
@export var initial_time: float = 10
@onready var remaining_time: float = initial_time

func _ready() -> void:
	var tween: Tween = get_tree().create_tween()
	tween.tween_property(self, "remaining_time", 0, initial_time)
	tween.tween_callback(func() : SignalBus.ran_out_of_time.emit())

func update_score(score: int) -> void:
	score_label.text = "Score %d" % score
	
func _process(delta: float) -> void:
	timer_label.text = "Timer %d" % int(remaining_time)
