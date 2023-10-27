import { tmpdir } from "os";
import neste, { parseBody } from "./index.js";
const app = neste(), app2 = neste();

app.use(parseBody({ formData: { tmpFolder: tmpdir() }, formEncoded: { limit: -1 } }));

app.all("/", ({ path, reqPath, hostname, app, body }, res) => res.json({ path, reqPath, hostname, sets: Array.from(app.settings.entries()), body }));

app.use(app2).use("/gg", app2);
app2.settings.set("json space", 4);
app2.get("/gg", ({ path, reqPath, hostname, app, body }, res) => res.json({ path, reqPath, hostname, sets: Array.from(app.settings.entries()), body }));

app.listen(3000, () => console.log("Listen on %s", 3000));