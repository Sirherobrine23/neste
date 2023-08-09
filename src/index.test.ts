import neste from "./index";
const app = neste();

const app2 = neste.Router();
app.use("/:app2", app2);
app2.get("/ok", (req, res) => res.json({ app2: true, params: req.params }));

app.get("/throw2", async function() { throw new Error("From throw 2"); });
app.get("/throw", function () { throw new Error("From throw 1"); });

app.get("/", (req, res) => {
  res.json({
    stack: Array.isArray(req["app"].stack),
  });
});

app.get("/:google", (req, res) => {
  res.setCookie("test", String(Math.random()));
  res.setCookie("future", String(new Date(Date.now() + 1000 * 60 * 60 * 20)));
  res.json({
    ok: true,
    req: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      query: req.query,
      cookies: Array.from(req.Cookies.keys()).reduce((acc, k) => { acc[k] = req.Cookies.get(k); return acc; }, {}),
      parms: req.params,
    },
    res: {
      headers: res.getHeaders(),
    }
  });
});


app.use((err, req, res, next) => res.status(500).json({ err: err.stack || err.toString() }))
app.listen(3000, () => console.log("Listen on %s", 3000));