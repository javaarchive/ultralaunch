import MinecraftController from "./mc-launch-core/minecraft_controller";

import {config} from "./config";
import builddata from "./builddata";

import chalk from "chalk";

const controller = new MinecraftController(config);

(async () => {
    console.log(chalk.magenta("Ultralaunch Minecraft Launcher v" + builddata.VERSION));
    console.log(chalk.blue("This is Minimal Launcher. It will not popup any additional windows other than this one. "));
    console.log(chalk.magenta("Checking player data. You'll be prompted if any needed data is missing"));
    console.log(chalk.cyan("Downloading game (if needed)..."));
    await controller.prepare();
    console.log(chalk.cyan("Game downloaded! Launching now!"));
    await controller.run();
})