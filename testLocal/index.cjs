const { randomBytes } = require("crypto");
const neste = require("../export/index.cjs");
const path = require("path");
const app = neste();
app.listen(3000, () => console.log("Listen on %s", 3000));
// app.use(({res}) => res.status(500).json({ error: ok }));
app.use(neste.staticFile(__dirname), neste.parseBody({ formData: { tmpFolder: path.join(__dirname, "localUpload") } }));
app.post("/", async (req, res) => {
  console.log(req.body);
  res.json({
    ok: true,
    body: req.body,
    headers: req.headers,
  });
});

app.get("/:fist", ({ params, path, fullPath }, res) => res.json({ path, fullPath, params }));
app.use("/:personName", neste.router().get("/:union/:Specie", ({ params, path, fullPath }, res) => {
  // if ((["sonic", "shadown", "shadow"]).includes(params.personName.toLowerCase()) && params.Specie.toLowerCase() === "hedgehog") return res.json({ message: "You are Sonic fan" });
  res.json({ path, fullPath, params });
}));

app.ws("/", (req, res) => {
  res.onmessage = e => {
    if (e.data.length <= 0) return;
    console.log("From WS: %O", e.data.toString());
    res.send(JSON.stringify({
      at: new Date(),
      msg: e.data.toString(),
    }));
    res.send(randomBytes(8));
  };
});

app.use(({res}) => res.status(404).json({ error: "Path not exists" }));
app.useError((err, req, res, next) => res.status(500).json({ error: err.message || String(err) }));