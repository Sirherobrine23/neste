# Neste

this is a wrapper over Nodejs modules and was completely writed in typescript, strongly inspired by express but with some corrections for Promises to work.

## Example

### Javascript

```js
import Neste from "@sirherobrine23/http_server";
const app = Neste();
app.get("/", ({res}) => res.json({message: "Hello world"}));
app.get("/text", (_req, res) => res.send("Hello world"));
app.post("/upload", async () => {
  throw new Error("is promise throw");
}).post("/test", () => {
  throw new Error("is throw");
});

const app2 = Neste.Route();
app2.all("*", (req) => req.res.json({ok: true}));

// fix to /app2 if no start with slash
app.use("app2", app2);
app.use(app2);

app.on("listen", (data) => console.log("%s Listen on %O", data.protocol, data.address));
app.listen("http", 3000);
```

### Typescript

```typescript
import Neste, { handler } from "@sirherobrine23/http_server";
const app = Neste();
const all: handler = (req, res) => res.json({ok: true});
app.all("*", all);
app.listen();
```
