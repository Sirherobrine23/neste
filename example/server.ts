import createApp, { createRoute } from "../src/index.js";
const app = createApp();
app.listen(3000, () => console.log("Listen on 3000"));
app.get("/", (_req, _res, next) => next(), ({res, req}) => res.json({
  from: "next",
  ip: req.ip,
  port: req.port,
  family: req.socket.remoteFamily,
  local: {
    port: req.socket.localPort,
    addr: req.socket.localAddress
  }
}));

app.route("/ip").get((req, res) => {
  const type = req.query.t ?? req.query.type;
  const ip = req.ip ?? null;
  if (type === "yaml" || type === "yml") return res.yaml({ip});
  else if (type === "text") res.send(ip);
  return res.json({ip});
});

app.all("/body", (req, res, next) => req.method !== "GET" ? next() : res.status(400).json({error: "methods with Body only"}), ({res, req}) => res.json({
  body: req.body
}));

const app2 = createRoute();
app.use("/main", app2);
app2.get("/", (req) => {req.res.json({ok: true})});
app2.get("/throw", () => {throw new Error("test 1")});
app2.get("/throw2", async () => {throw new Error("test 2")});

const app3 = createApp();
app2.use(app3);
app2.use("/:google", app3);
app3.get("/bing", (req, res) => {
  res.json({
    ok: "Bing from app3",
    parms: req.params
  });
});

app.all("*", (req, res) => {
  return res.json({
    method: req.method,
    path: req.path,
    protocol: req.protocol,
    error: "Page not exist"
  });
});