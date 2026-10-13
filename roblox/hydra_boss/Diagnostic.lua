-- BARRE DE COMMANDE : sélectionne le modèle de l'hydre, colle, Entrée.
local m = game:GetService("Selection"):Get()[1]
if not m then return warn("Sélectionne d'abord le modèle de l'hydre") end
local n = { Bone = 0, MeshPart = 0, KeyframeSequence = 0 }
for _, d in m:GetDescendants() do
	if n[d.ClassName] then n[d.ClassName] += 1 end
	if d:IsA("KeyframeSequence") then print("Anim trouvée dans le modèle :", d:GetFullName()) end
end
print("Modèle :", m.Name, m.ClassName)
print("Bones :", n.Bone, "(il en faut 37)")
print("MeshParts :", n.MeshPart, "(il en faut 11)")
print("AnimationController :", m:FindFirstChildWhichIsA("AnimationController", true) and "oui" or "NON")
print("Humanoid :", m:FindFirstChildWhichIsA("Humanoid", true) and "oui" or "non")
print("Animator :", m:FindFirstChildWhichIsA("Animator", true) and "oui" or "NON")
print("PrimaryPart :", m:IsA("Model") and tostring(m.PrimaryPart) or "-")
local saves = game:GetService("ServerStorage"):FindFirstChild("RBX_ANIMSAVES")
if saves then for _, d in saves:GetDescendants() do if d:IsA("KeyframeSequence") then print("Anim sauvée :", d:GetFullName()) end end end
print("Scripts dans le modèle :")
for _, d in m:GetDescendants() do if d:IsA("LuaSourceContainer") then print("  ", d.ClassName, d:GetFullName()) end end
