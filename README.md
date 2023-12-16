![npm](https://img.shields.io/npm/dw/neste) [![Teste](https://sirherobrine23.org/utils/neste/actions/workflows/test.yml/badge.svg)](https://sirherobrine23.org/utils/neste/actions/workflows/test.yml)

A fork of [express](https://github.com/expressjs/express) with patches and improvements for new integrations, fixes and more.

```js
import neste from "neste";
const app = neste();

app.get("/", (req, res) => res.send("hello world"));
app.get("/json", (req, res) => res.json({message: "hello world"}));

app.listen(3000, () => {
  console.log("Listen on %s", 3000);
});
```

### Example

#### Standalone Nodejs

```js
import neste from "neste";
const app = neste();

app.get("/", (req, res) => res.set("Content-Type", "text/html").send("<p>Hello world</p>"));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log("Listen on %s", PORT));
```

#### Next.js API Routes

- path: `/[...root].ts`

```js
import { Router } from "Neste";
const app = new Router();
export default app;

app.get("/", (req, res) => res.send(`<p>Hello from root API</p>`));
```

- path: `/form/[...formsSlugs].ts`

```js
import { Router } from "Neste";
const app = new Router({ "app path": "/form" });
export default app;

app.get("/", (req, res) => res.send(`<p>Hello from forms router</p>`));
```

## 3.x notice

version 3.0.0 is removing support for CommonJS, keeping only the ESM module. if you app/module is Commonjs module migrate to ESM or keep on ExpressJS.

## Express middleware's

> **Important**
> as a fork of express will be compatible some, probably some others have stopped in the future.
