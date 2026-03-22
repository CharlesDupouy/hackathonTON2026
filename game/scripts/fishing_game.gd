extends Node

var score: int = 0
@export var hud: HUD

func _ready() -> void:
	SignalBus.score_increase.connect(_on_score_increase)
	SignalBus.ran_out_of_time.connect(end_game)

func _on_score_increase(v: int) -> void:
	score += v
	hud.update_score(score)
	
func send_score(score: int):
	print("score: %d" % score)
	JavaScriptBridge.eval("Telegram.WebApp.sendData('%d');" % score)
	
func end_game() -> void:
	send_score(score)
	
