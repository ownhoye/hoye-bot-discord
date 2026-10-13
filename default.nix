{ lib
, stdenv
, nodejs_20
, pnpm ? null
}:

stdenv.mkDerivation rec {
  pname = "lolicord";
  version = "1.27.8";

  src = lib.cleanSource ./.;

  nativeBuildInputs = [
    nodejs_20
  ] ++ lib.optional (pnpm != null) pnpm.configHook;

  buildPhase = ''
    runHook preBuild
    if [ -d "dist/desktop" ] && [ -f "dist/desktop/patcher.js" ]; then
      echo "LoliCord: Using pre-compiled dist/desktop build."
    else
      echo "LoliCord: Building dist files..."
      node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs || true
    fi
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/lolicord
    if [ -d "dist/desktop" ]; then
      cp -r dist/desktop/* $out/share/lolicord/
    elif [ -d "dist" ]; then
      cp -r dist/* $out/share/lolicord/
    fi
    runHook postInstall
  '';

  meta = with lib; {
    description = "Everything Discord doesn't build, we create (LoliCord)";
    homepage = "https://github.com/ownhoye/hoye-bot-discord";
    license = licenses.gpl3Plus;
    platforms = platforms.all;
  };
}
