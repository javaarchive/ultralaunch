import {default as Conf} from "conf"; // hack ig
import builddata from "./builddata.js";
import myconfig from "./myconfig.js";
import os from "os";

export default new Conf({
    projectVersion: builddata.VERSION,
    projectName: myconfig.projectName || "ultralaunch",
    defaults: myconfig.defaults,
    configName: "ultralauncher",
    projectSuffix: "",
    cwd: os.platform() == "win32" ? null:process.cwd()
});
