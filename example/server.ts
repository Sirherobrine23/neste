import createApp, { createRoute } from "../src/index.js";
const app = createApp();
app.listen(3000, () => console.log("Listen on 3000"));
app.get("/", ({res, req}) => res.json({
  from: "next",
  ip: req.ip,
  port: req.port,
  family: req.socket.remoteFamily,
  local: {
    port: req.socket.localPort,
    addr: req.socket.localAddress
  }
}));

app.get("wait", ({res}) => setTimeout(() => res.json({after: 1000}), 1000));
app.get("throw", ({}) => Promise.reject(new Error("Teste")));

const app2 = createRoute();
app.use("app2", app2);
app2.get("/", ({req, res}) => res.json({ip: req.ip, port: req.port}));

app.use((err, _req, res, _next) => {
  console.log("Catch error", err);
  return res.status(500).json({error: String(err?.message || err)});
})