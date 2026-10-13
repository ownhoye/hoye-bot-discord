import {log} from "./log";
import {action, status} from "../../stores/installation";

const supportURL = "https://github.com/ownhoye/hoye-bot-discord/issues";

export default function fail() {
    log("");
    log(`The ${action.value} seems to have failed. If this problem is recurring, open an issue on GitHub. ${supportURL}`);
    status.set("error");
}