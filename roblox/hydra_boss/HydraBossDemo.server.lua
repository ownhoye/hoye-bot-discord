-- Script serveur de démo : place-le dans le modèle HydraBoss.
-- Le boss fait Idle, puis enchaîne ses attaques en boucle.
local boss = script.Parent
local Anims = require(boss:WaitForChild("HydraAnimations")).new(boss)

Anims:Play("Idle")
local attacks = { "Roar", "Bite", "TailSwipe", "WingGust" }
while true do
	task.wait(3)
	Anims:PlayOnce(attacks[math.random(#attacks)])
end
