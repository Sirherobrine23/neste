import neste from "./index";

const app = neste();
const app2 = neste.Router();

app.use("/local", neste.staticFile("./"));
app.get("/:google", (req, res) => {
  res.setCookie("test", String(Math.random()));
  res.setCookie("future", String(new Date(Date.now() + 1000 * 60 * 60 * 20)));
  res.json({
    ok: true,
    req: {
      method: req.method,
      path: req.path,
      ipPort: req.ipPort,
      ip: req.ip,
      protocol: req.protocol,
      secure: req.secure,
      query: req.query,
      cookies: Array.from(req.Cookies.keys()).reduce((acc, k) => { acc[k] = req.Cookies.get(k); return acc; }, {}),
      parms: req.params,
      hostname: {
        domain: req.hostname,
        subs: req.subdomains,
      },
    },
    res: {
      headers: res.getHeaders(),
    }
  });
});
app.use("/:app2", app2);
app2.get("/ok", (req, res) => res.json({ app2: true, params: req.params }));
app2.get("/:app(.*)", (req, res) => res.json({ app2: true, params: req.params }));
app.get("/throw2", async () => { throw new Error("From async throw 2"); });
app.get("/throw", () => { throw new Error("From sync throw 1"); });
app.get("/", (req, res) => {
  res.json({
    query: req.query
  });
});

app.use((err, _req, res, _next) => res.status(500).json({
  err: (err.message || String(err)),
  ...(err.stack ? {
    stack: err.stack.split("\n")
  } : {})
}));

app.listen(3000, () => console.log("Listen on %s", 3000));
// https.createServer(app.handler).listen(3800, () => console.log("Listen on %s", 3800));