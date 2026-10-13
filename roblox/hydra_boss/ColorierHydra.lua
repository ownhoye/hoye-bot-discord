-- À coller dans la barre de commande de Studio (Affichage → Barre de commande),
-- avec le modèle importé sélectionné. Remet les couleurs perdues à l'import FBX.
local COLORS = {
	Hydra_scale_black = Color3.fromRGB(43, 42, 48),
	Hydra_scale_grey = Color3.fromRGB(60, 59, 67),
	Hydra_belly_beige = Color3.fromRGB(224, 203, 169),
	Hydra_spike_red = Color3.fromRGB(181, 18, 27),
	Hydra_claw_grey = Color3.fromRGB(91, 90, 98),
	Hydra_mouth_red = Color3.fromRGB(110, 11, 18),
	Hydra_teeth_ivory = Color3.fromRGB(241, 231, 211),
	Hydra_socket_black = Color3.fromRGB(12, 12, 14),
	Hydra_eye_glow = Color3.fromRGB(255, 42, 26),
	Hydra_membrane_red_dark = Color3.fromRGB(135, 16, 26),
	Hydra_membrane_red = Color3.fromRGB(154, 17, 24),
}
local model = game:GetService("Selection"):Get()[1]
for _, part in model:GetDescendants() do
	local color = part:IsA("MeshPart") and COLORS[part.Name]
	if color then
		part.Color = color
		part.Material = part.Name == "Hydra_eye_glow" and Enum.Material.Neon or Enum.Material.SmoothPlastic
	end
end
print("Hydre coloriée")
