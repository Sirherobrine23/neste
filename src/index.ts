import { Application } from "./application.js";
import { mixin } from "./utils.js";
import { req } from "./request.js";
import { res } from "./response.js";
import EventEmitter from "node:events";

function createApplication() {
  const app: ((...parms: Parameters<Application["handle"]>) => void) & Application = ((req: any, res: any, next: any) => app.handle(req, res, next)) as any;
  mixin(app, EventEmitter.EventEmitter.prototype, false);
  mixin(app, Application.prototype, false);

  // expose the prototype that will get set on requests
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  });

  // expose the prototype that will get set on responses
  app.response = Object.create(res, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  });

  // @ts-ignore
  app.init();
  return app;
}

namespace createApplication {
  () => Application;
  export function Route() {
    return new Application();
  }
}

export = createApplication;