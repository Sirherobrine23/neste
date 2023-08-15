const path = require("path");
const crypto = require("crypto");
const neste = require("../export/index.cjs");
const app = neste();

app.listen(3000, () => console.log("Listen on %s", 3000));
app.use(neste.staticFile(__dirname), neste.bodyParse({ formData: { tmpFolder: path.join(__dirname, "localUpload") } }));
app.post("/", async (req, res) => {
  console.log(req.body);
  res.json({
    ok: true,
    body: req.body,
    headers: req.headers,
  });
});

app.ws("/", (req, res) => {
  res.onmessage = e => {
    if (e.data.length <= 0) return;
    console.log("From WS: %O", e.data.toString());
    res.send(JSON.stringify({
      at: new Date(),
      msg: e.data.toString(),
    }));
    res.send(crypto.randomBytes(8));
  };
});