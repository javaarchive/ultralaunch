
const NODE_PLATFORM_TO_MC_PLATFORM: { [key: string]: any } = {
    "linux": "linux",
    "darwin": "osx", // macos but osx is seen in 1.8.9
    "win32": "windows"
};

const constants = {
    DEFAULT_VERSION:"1.8.9",
    MIN_USERNAME_LENGTH: 3,
    MAX_USERNAME_LENGTH: 16,
    USER_AGENT: "Custom Minecraft Launcher/1.0.0",
    VERSION_MANIFEST_URL: "https://launchermeta.mojang.com/mc/game/version_manifest.json",
    ASSETS_BASE: "https://resources.download.minecraft.net",
    NODE_PLATFORM_TO_MC_PLATFORM: NODE_PLATFORM_TO_MC_PLATFORM,
    AUTH_URL: "https://authserver.mojang.com",
    GAME_ID: "Minecraft"
}

export default constants;