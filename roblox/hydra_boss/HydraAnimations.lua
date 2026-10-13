--!strict
-- ModuleScript à placer DANS le modèle HydraBoss (à côté de l'AnimationController).
-- Remplis les IDs après avoir publié chaque animation depuis l'Animation Editor.
--
-- Usage (Script serveur) :
--   local Anims = require(boss.HydraAnimations).new(boss)
--   Anims:Play("Idle")
--   Anims:PlayOnce("Bite")      -- revient automatiquement sur Idle/Walk
--   Anims:SetMoving(true)       -- bascule Idle <-> Walk

local IDS: { [string]: string } = {
	Idle = "rbxassetid://0",
	Walk = "rbxassetid://0",
	Roar = "rbxassetid://0",
	Bite = "rbxassetid://0",
	TailSwipe = "rbxassetid://0",
	WingGust = "rbxassetid://0",
	Hit = "rbxassetid://0",
	Death = "rbxassetid://0",
}

local LOOPED = { Idle = true, Walk = true }
local PRIORITY = {
	Idle = Enum.AnimationPriority.Idle,
	Walk = Enum.AnimationPriority.Movement,
	Hit = Enum.AnimationPriority.Action2,
	Death = Enum.AnimationPriority.Action4,
}

local HydraAnimations = {}
HydraAnimations.__index = HydraAnimations

function HydraAnimations.new(model: Model)
	local controller = model:FindFirstChildOfClass("AnimationController")
		or model:FindFirstChildOfClass("Humanoid")
	if not controller then
		controller = Instance.new("AnimationController")
		controller.Parent = model
	end
	local animator = controller:FindFirstChildOfClass("Animator") or Instance.new("Animator")
	animator.Parent = controller

	local self = setmetatable({ tracks = {}, moving = false, dead = false }, HydraAnimations)
	for name, id in IDS do
		if id ~= "rbxassetid://0" then
			local anim = Instance.new("Animation")
			anim.Name = name
			anim.AnimationId = id
			local track = animator:LoadAnimation(anim)
			track.Looped = LOOPED[name] == true
			track.Priority = PRIORITY[name] or Enum.AnimationPriority.Action
			self.tracks[name] = track
		else
			warn(`[HydraAnimations] ID manquant pour "{name}"`)
		end
	end
	return self
end

function HydraAnimations:Play(name: string, fade: number?)
	local track = self.tracks[name]
	if track and not track.IsPlaying then
		track:Play(fade or 0.25)
	end
	return track
end

function HydraAnimations:Stop(name: string, fade: number?)
	local track = self.tracks[name]
	if track then
		track:Stop(fade or 0.25)
	end
end

-- Joue une animation d'attaque/réaction puis attend sa fin.
function HydraAnimations:PlayOnce(name: string)
	if self.dead then
		return
	end
	local track = self.tracks[name]
	if not track then
		return
	end
	track:Play(0.15)
	track.Stopped:Wait()
end

function HydraAnimations:SetMoving(moving: boolean)
	if self.dead or moving == self.moving then
		return
	end
	self.moving = moving
	self:Play(moving and "Walk" or "Idle")
	self:Stop(moving and "Idle" or "Walk")
end

function HydraAnimations:Die()
	self.dead = true
	for name, track in self.tracks do
		if name ~= "Death" then
			track:Stop(0.2)
		end
	end
	local death = self.tracks.Death
	if death then
		death:Play(0.1)
		-- reste au sol sur la dernière frame
		task.delay(death.Length - 0.05, function()
			death:AdjustSpeed(0)
		end)
	end
end

return HydraAnimations
