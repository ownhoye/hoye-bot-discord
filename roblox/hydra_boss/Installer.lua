-- BARRE DE COMMANDE : sélectionne le modèle de l'hydre, colle, Entrée.
-- Crée AnimationController + Animator + le ModuleScript HydraAnimations + le Script de démo.
-- Tant qu'un ID vaut 0, le module utilise l'anim sauvée (KeyframeSequence) : ça marche en
-- test dans Studio. Pour le vrai jeu, publie les anims et mets leurs IDs dans HydraAnimations.
local m = game:GetService("Selection"):Get()[1]
if not m then return warn("Sélectionne d'abord le modèle de l'hydre") end
local ctrl = m:FindFirstChildWhichIsA("AnimationController") or m:FindFirstChildWhichIsA("Humanoid")
if not ctrl then ctrl = Instance.new("AnimationController"); ctrl.Parent = m end
if not ctrl:FindFirstChildWhichIsA("Animator") then Instance.new("Animator").Parent = ctrl end
for _, name in { "HydraAnimations", "HydraBossDemo" } do
	local old = m:FindFirstChild(name); if old then old:Destroy() end
end

local mod = Instance.new("ModuleScript")
mod.Name = "HydraAnimations"
mod.Source = [==[
-- Mets ici les IDs obtenus avec "Publish to Roblox" dans l'Animation Editor.
local IDS = {
	Idle = 0, Walk = 0, Roar = 0, Bite = 0,
	TailSwipe = 0, WingGust = 0, Hit = 0, Death = 0,
}
local LOOPED = { Idle = true, Walk = true }

local KSP = game:GetService("KeyframeSequenceProvider")
local ServerStorage = game:GetService("ServerStorage")

-- Cherche une anim sauvée (dans le modèle ou ServerStorage.RBX_ANIMSAVES) dont le nom contient `name`.
local function findSaved(model, name)
	local places = { model }
	local saves = ServerStorage:FindFirstChild("RBX_ANIMSAVES")
	if saves then table.insert(places, saves) end
	for _, place in places do
		for _, d in place:GetDescendants() do
			if d:IsA("KeyframeSequence") and string.find(string.lower(d.Name), string.lower(name), 1, true) then
				return d
			end
		end
	end
	-- l'import du modèle crée une seule anim (Idle) qui porte souvent le nom du fichier
	if name == "Idle" then
		for _, d in model:GetDescendants() do
			if d:IsA("KeyframeSequence") then return d end
		end
	end
end

local M = {}
M.__index = M

function M.new(model)
	local ctrl = model:FindFirstChildWhichIsA("AnimationController") or model:FindFirstChildWhichIsA("Humanoid")
	local animator = ctrl:FindFirstChildWhichIsA("Animator")
	local self = setmetatable({ tracks = {}, dead = false, moving = false }, M)
	for name, id in IDS do
		local assetId
		if id ~= 0 then
			assetId = "rbxassetid://" .. id
		else
			local ks = findSaved(model, name)
			if ks then
				assetId = KSP:RegisterKeyframeSequence(ks) -- marche seulement dans Studio
			end
		end
		if assetId then
			local a = Instance.new("Animation")
			a.AnimationId = assetId
			local ok, track = pcall(function() return animator:LoadAnimation(a) end)
			if ok then
				track.Looped = LOOPED[name] == true
				track.Priority = LOOPED[name] and Enum.AnimationPriority.Idle or Enum.AnimationPriority.Action
				self.tracks[name] = track
				print("[Hydra] anim chargée :", name, assetId)
			else
				warn("[Hydra] échec chargement", name, track)
			end
		else
			warn("[Hydra] pas d'ID ni d'anim sauvée pour", name)
		end
	end
	return self
end

function M:Play(name)
	local t = self.tracks[name]
	if t and not t.IsPlaying then t:Play(0.25) end
end

function M:Stop(name)
	local t = self.tracks[name]
	if t then t:Stop(0.25) end
end

function M:PlayOnce(name)
	local t = self.tracks[name]
	if self.dead or not t then return end
	t:Play(0.15)
	t.Stopped:Wait()
end

function M:SetMoving(moving)
	if self.dead or moving == self.moving then return end
	self.moving = moving
	self:Play(moving and "Walk" or "Idle")
	self:Stop(moving and "Idle" or "Walk")
end

function M:Die()
	self.dead = true
	for n, t in self.tracks do if n ~= "Death" then t:Stop(0.2) end end
	local d = self.tracks.Death
	if d then
		d:Play(0.1)
		task.delay(d.Length - 0.05, function() d:AdjustSpeed(0) end)
	end
end

return M
]==]
mod.Parent = m

local demo = Instance.new("Script")
demo.Name = "HydraBossDemo"
demo.Source = [==[
local boss = script.Parent
local Anims = require(boss:WaitForChild("HydraAnimations")).new(boss)
Anims:Play("Idle")
local attacks = { "Roar", "Bite", "TailSwipe", "WingGust" }
while true do
	task.wait(3)
	local a = attacks[math.random(#attacks)]
	if Anims.tracks[a] then Anims:PlayOnce(a) end
end
]==]
demo.Parent = m
print("Installé dans", m:GetFullName(), "- lance Play et regarde la Sortie")
