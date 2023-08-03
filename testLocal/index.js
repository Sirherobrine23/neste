const neste = require("../src/index");
const app = neste();
app.get("/", (req, res) => {
  res.json({ ok: true });
});

app.listen(3000, () => console.log("Listen on %s", 3000));