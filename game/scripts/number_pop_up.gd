class_name NumbrePopUp
extends VBoxContainer

@export var label_pack: PackedScene
@export var gradient: Gradient
@export var anim: AnimationPlayer

func display(pos: Vector2, scores: Array[int]) -> void:
	position = pos
	anim.play("grownfade")
	for s in scores:
		var lab: Label = label_pack.instantiate()
		lab.text = "+%d" % s
		var t: float = ((s as float) - 1.0 ) / 4.0
		lab.modulate = gradient.sample(t)
		add_child(lab)
	
