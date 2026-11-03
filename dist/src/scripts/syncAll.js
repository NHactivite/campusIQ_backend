"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const Event_1 = __importDefault(require("../models/Event"));
const Notice_1 = __importDefault(require("../models/Notice"));
const Feature_1 = __importDefault(require("../models/Feature"));
const Glance_1 = __importDefault(require("../models/Glance"));
const Linkage_1 = __importDefault(require("../models/Linkage"));
const chatbotSync_1 = require("../utils/chatbotSync");
async function main() {
    await mongoose_1.default.connect(process.env.MONGO_URI || "", { dbName: "IICSibsagar" });
    const run = async (name, list, fn) => {
        for (const d of list)
            await fn(d);
        console.log(`queued ${list.length} ${name}`);
    };
    await run("events", await Event_1.default.find(), chatbotSync_1.syncEvent);
    await run("notices", await Notice_1.default.find(), chatbotSync_1.syncNotice);
    await run("features", await Feature_1.default.find(), chatbotSync_1.syncFeature);
    await run("glance cards", await Glance_1.default.find(), chatbotSync_1.syncGlance);
    await run("linkages", await Linkage_1.default.find(), chatbotSync_1.syncLinkage);
    await mongoose_1.default.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
