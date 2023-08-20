![npm](https://img.shields.io/npm/dw/neste) [![Teste](https://github.com/Sirherobrine23/neste/actions/workflows/test.yml/badge.svg)](https://github.com/Sirherobrine23/neste/actions/workflows/test.yml)

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

```js
const neste = require("neste"), app = neste();

app.get("/", (req, res) => res.send("hello world"));
app.get("/json", (req, res) => res.json({message: "hello world"}));

app.listen(3000, () => {
  console.log("Listen on %s", 3000);
});
```

## Installation

in a simple way:

```sh
npm install --save neste
```

### Express middleware's

> **Important**
> as a fork of express will be compatible some, probably some others have stopped in the future.
