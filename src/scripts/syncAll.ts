import "dotenv/config";
import mongoose from "mongoose";
import Event from "../models/Event";
import Notice from "../models/Notice";
import Feature from "../models/Feature";
import Glance from "../models/Glance";
import Linkage from "../models/Linkage";
import { syncEvent, syncNotice, syncFeature, syncGlance, syncLinkage } from "../utils/chatbotSync";

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "", { dbName: "IICSibsagar" });
  const run = async (name: string, list: any[], fn: (d: any) => Promise<void>) => {
    for (const d of list) await fn(d);
    console.log(`queued ${list.length} ${name}`);
  };
  await run("events", await Event.find(), syncEvent);
  await run("notices", await Notice.find(), syncNotice);
  await run("features", await Feature.find(), syncFeature);
  await run("glance cards", await Glance.find(), syncGlance);
  await run("linkages", await Linkage.find(), syncLinkage);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });