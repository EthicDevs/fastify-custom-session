# `fastify-custom-session`

[![NPM](https://img.shields.io/npm/v/@ethicdevs/fastify-custom-session?color=red)](https://www.npmjs.com/@ethicdevs/fastify-custom-session)
[![MIT License](https://img.shields.io/github/license/ethicdevs/fastify-custom-session.svg?color=blue)](https://github.com/ethicdevs/fastify-custom-session/blob/master/LICENSE)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=ethicdevs/fastify-custom-session)](https://dependabot.com)
[![Average issue resolution time](https://isitmaintained.com/badge/resolution/ethicdevs/fastify-custom-session.svg)](https://isitmaintained.com/project/ethicdevs/fastify-custom-session)
[![Number of open issues](https://isitmaintained.com/badge/open/ethicdevs/fastify-custom-session.svg)](https://isitmaintained.com/project/ethicdevs/fastify-custom-session)

A Fastify (v3.x+) plugin that let you use session and decide only where to load/save from/to

## Installation

```shell
$ yarn add @ethicdevs/fastify-custom-session
# or
$ npm i @ethicdevs/fastify-custom-session
```

## Usage

```ts
import fastifyCustomSession, {
  // Adapters for popular softwares/services
  FirebaseSessionAdapter, // Pick one ;)
  PostgresSessionAdapter, // Pick one ;)
  PrismaSessionAdapter, // Pick one ;)
} from "@ethicdevs/fastify-custom-session";

let server = null;

function main() {
  server = fastify(); // provide your own
  // ...
  server.register(fastifyCustomSession, {
    password: "super-secret-session-secret", // or better: Env.SESSION_SECRET,
    cookieName: "my_app_session_id", // or better: Env.COOKIE_NAME,
    cookieOptions: {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      expires: new Date(Date.now() + 10 * (8 * 3600) * 1000), // 10 days in secs
      path: "/",
      secure: false,
      sameSite: "lax",
      signed: true,
    },
    initialSession: {
      // ... your initial session shape goes here ...
    },
    storeAdapter: new PickedSessionAdapter(/* ... AdapterOptions ... */) as any,
  });
}

main();
```

then if you are a TypeScript user you will need to defined the shape of the
`session.data` object, you can do so easily by adding the following lines to your
`types/global/index.d.ts` file:

```ts
// use declaration merging to provide custom session interface
declare module "@ethicdevs/fastify-custom-session" {
  declare interface CustomSession {
    whateverYouWant: string;
    mySuperObject: {
      foo: string;
      bar: number;
      baz: string;
    };
  }
}
```

later on during request before you send the headers/response, typically in your controller/handler:

```ts
const myRequestHandler = async (request, reply) => {
  request.session.data.whateverYouWant = "foo";
  request.session.data.mySuperObject = {
    foo: "bar",
    bar: 42,
    baz: "quxx",
  };

  return reply.send("Hello with session!");
};

const mySecondRequestHandler = async (request, reply) => {
  // if you're a typescript user, enjoy ;)
  /* request.session.data.
                    | [p] whateverYouWant
                    | [p] mySuperObject */

  request.session.data.whateverYouWant; // foo
  request.session.data.object.foo; // bar
  request.session.data.object.bar; // 42

  return reply.send(
    "Cool value from session:" + request.session.data.object.baz,
  );
};
```

then enjoy the session being available both in your controllers/handlers and in
your data store table/collection (linked to the Adapter you chosen in first step).

## License

The [MIT](/LICENSE) license.
