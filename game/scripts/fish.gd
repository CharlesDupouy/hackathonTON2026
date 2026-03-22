class_name Fish
extends Node2D

signal fish_exited_screen(fish: Fish)

var direction: Vector2 = Vector2(-1, -1).normalized()
var speed: float
var perception_radius: float
var fish_data: FishData
var is_caught: bool = false
var rod: FishingRod
var fish_spawner: FishSpawner

@export var caught_distance: float = 5
@export var fish_settings: Array[FishData]
@export var sprite: Sprite2D
@export var animation_player: AnimationPlayer
@export var traiL: GPUParticles2D

func _ready() -> void:
	fish_data = fish_settings.pick_random()
	speed = fish_data.speed
	perception_radius = fish_data.perception_radius
	sprite.texture = fish_data.texture
	
	animation_player.play("updown")
	

func _physics_process(delta: float) -> void:
	if is_caught:
		return
	
	if rod and rod.is_floater_active() and is_in_radius():
		var new_dir: Vector2 = (get_floater_pos() - position).normalized()
		position += new_dir * speed * delta
		if is_just_caught():
			is_caught = true
			position = get_floater_pos()
			fish_spawner.add_to_caught_fishes(self)
			traiL.hide()
	else:
		position += direction * speed * delta


func _on_visible_on_screen_notifier_2d_screen_exited() -> void:
	fish_exited_screen.emit(self)
	
func is_in_radius() -> bool:
	return (position - get_floater_pos()).length() < perception_radius
	
func is_just_caught() -> bool:
	return (position - get_floater_pos()).length() < caught_distance
	

func get_floater_pos() -> Vector2:
	return fish_spawner.get_floater_in_fish_ref()
