extends Node

var counter: int = 0
@export var label: Label

func send_score(score: int):
	JavaScriptBridge.eval("Telegram.WebApp.sendData('%d');" % score)

func wallet_connected(address):
	print("wallet:", address)

func _on_connect_wallet_pressed():
	JavaScriptBridge.eval("connectWallet()")

func _on_button_pressed() -> void:
	counter += 1
	label.text = "Count: %d" % counter

func _on_button_2_pressed() -> void:
	send_score(counter)
