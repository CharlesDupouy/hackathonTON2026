class_name FishSpawner
extends Path2D

@export var packed_fish: PackedScene
@export var timer: Timer
@export var min_timer: float = 0.4
@export var max_timer: float = 2

var caught_fishes: Array[Fish]

func _ready() -> void:
	launch_timer()
	SignalBus.rod_lifted.connect(_on_rod_lifted)

func _on_timer_timeout() -> void:
	var new_fish: Fish = packed_fish.instantiate()
	new_fish.rod = %FishingRod
	new_fish.fish_spawner = self
	add_child(new_fish)
	new_fish.position = curve.sample(0, randf())
	new_fish.fish_exited_screen.connect(delete_fish)
	launch_timer()

func launch_timer() -> void:
	timer.start(randf_range(min_timer, max_timer))
	
func delete_fish(fish: Fish):
	remove_child(fish)
	fish.queue_free()
	
func get_floater_in_fish_ref() -> Vector2:
	return to_local(%FishingRod.get_global_floater_postion())
	
func add_to_caught_fishes(fish: Fish) -> void:
	caught_fishes.push_back(fish)
	
func _on_rod_lifted() -> void:
	var score: int = 0
	var scores: Array[int] = []
	for f in caught_fishes:
		score += f.fish_data.value
		scores.push_back(f.fish_data.value)
		remove_child(f)
		f.queue_free()
	caught_fishes.clear()
	SignalBus.score_increase.emit(score)
	SignalBus.score_breakdown.emit(scores)
