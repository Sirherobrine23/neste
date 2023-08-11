const path = require("path");
const neste = require("../src/index");
neste.default = neste;
const app = neste.default();

app.listen(3000, () => console.log("Listen on %s", 3000));
app.use(neste.staticFile(__dirname), neste.parseBody({ formData: { tmpFolder: path.join(__dirname, "localUpload") } }));
app.post("/", async (req, res) => {
  console.log(req.body);
  res.json({
    ok: true,
    body: req.body,
    headers: req.headers,
  });
});