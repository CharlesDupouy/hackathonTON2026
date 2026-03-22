class_name FishingRod
extends Node2D

enum Mode {ROTATING, EXTENDING, WAITING}
enum Direction {LEFT, RIGHT}
var mode: Mode = Mode.ROTATING
var dir: Direction 
var wasMousePressed: bool = false
var wasTouchPressed: bool = false

@export var angle_speed: float = 20
@export var max_angle: float = 60
@export var max_length: float = 400
@export var extending_speed: float = 100
@export var floater_base: Node2D
@export var floater_sprite: AnimatedSprite2D
var counter: int = 0

func _input(event) -> void:			
	if event is InputEventScreenTouch and event.pressed:
		counter += 1
		handle_click()
		
func handle_click() -> void:
	if mode == Mode.ROTATING:
		mode = Mode.EXTENDING
	elif mode == Mode.EXTENDING:
		mode = Mode.WAITING
		floater_sprite.play("default")
	else:
		mode = Mode.ROTATING
		SignalBus.rod_lifted.emit()
		rotation_degrees = 0
		floater_base.position.y = 0

func _physics_process(delta: float) -> void:
	if mode == Mode.ROTATING:
		rotating_update(delta)
	if mode == Mode.EXTENDING:
		extending_update(delta)
		
func rotating_update(delta: float) -> void:
	var dangle: float = angle_speed * delta
	if dir == Direction.LEFT:
		rotation_degrees -= dangle
		if rotation_degrees < -max_angle:
			rotation_degrees = -2 * max_angle - rotation_degrees
			dir = Direction.RIGHT
	else:
		rotation_degrees += dangle
		if rotation_degrees > max_angle:
			rotation_degrees = 2 * max_angle - rotation_degrees
			dir = Direction.LEFT
			
	floater_sprite.rotation_degrees = -rotation_degrees
			
func extending_update(delta: float) -> void:
	var dx: float = extending_speed * delta
	floater_base.position.y -= dx

func _on_visible_on_screen_notifier_2d_screen_exited() -> void:
	if mode == Mode.EXTENDING:
		mode = Mode.WAITING
		
func is_floater_active() -> bool:
	return mode == Mode.WAITING
	
func get_global_floater_postion() -> Vector2:
	return floater_base.global_position
