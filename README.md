# `fastify-custom-session`

[![NPM](https://img.shields.io/npm/v/@ethicdevs/fastify-custom-session?color=red)](https://www.npmjs.com/@ethicdevs/fastify-custom-session)
[![MIT License](https://img.shields.io/github/license/ethicdevs/fastify-custom-session.svg?color=blue)](https://github.com/ethicdevs/fastify-custom-session/blob/master/LICENSE)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=ethicdevs/fastify-custom-session)](https://dependabot.com)
[![Average issue resolution time](https://isitmaintained.com/badge/resolution/ethicdevs/fastify-custom-session.svg)](https://isitmaintained.com/project/ethicdevs/fastify-custom-session)
[![Number of open issues](https://isitmaintained.com/badge/open/ethicdevs/fastify-custom-session.svg)](https://isitmaintained.com/project/ethicdevs/fastify-custom-session)

A Fastify (v3.x+) plugin that let you use session and decide only where to load/save from/to

## Built-in adapters

- FirebaseSessionAdapter (firebase-admin) [fully working]
- PrismaSessionAdapter (@prisma/client compat layer) [fully working]
- PostgresSessionAdapter (pg, pg-pool) [wip]

## Installation

```shell
$ yarn add @ethicdevs/fastify-custom-session
# or
$ npm i @ethicdevs/fastify-custom-session
```

## Usage

```ts
import fastifyCookies from "@fastify/cookie";
import fastifyCustomSession, {
  FirebaseSessionAdapter, // Firebase Firestore adapter
  MockSessionAdapter, // In Memory adapter (for testing)
  PostgresSessionAdapter, // PostgreSQL adapter (pg/pg-pool)
  PrismaSessionAdapter, // Prisma Client adapter
} from "@ethicdevs/fastify-custom-session";

let server = null;

function main() {
  server = fastify(); // provide your own

  // some cookies options
  const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
  const cookiesOptions = {
    domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
    httpOnly: true,
    expires: new Date(Date.now() + 10 * (8 * 3600) * 1000), // 10 days in secs
    path: "/",
    secure: false,
    sameSite: "lax",
    signed: true,
  };
  // register the cookies plugin FIRST.
  server.register(fastifyCookies, {
    parseOptions: cookiesOptions,
    secret: cookieSecret,
  });
  // then register the customSession plugin.
  server.register(fastifyCustomSession, {
    password: cookieSecret,
    cookieName: "my_app_session_id", // or better: Env.COOKIE_NAME,
    cookieOptions,
    storeAdapter: new MockSessionAdapter({
      /* ... AdapterOptions ... */
    }) as any,
    initialSession: { // initial data in session (so you can avoid null's)
      whateverYouWant: '<unset>',
      aNullableProp: null,
      mySuperObject: {
        foo: '<unset>',
        bar: 0,
        baz: '<unset>',
      };
    },
  });
}

main();
```

then if you are a TypeScript user you will need to define the shape of the
`session.data` object, you can do so easily by adding the following lines to your
`types/global/index.d.ts` file:

```ts
// use declaration merging to provide custom session interface
declare module "@ethicdevs/fastify-custom-session" {
  declare interface CustomSession {
    // request.session.data shape
    whateverYouWant: string;
    aNullableProp: null | string;
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
  request.session.data.aNullableProp = "not null anymore";
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

  request.session.data.whateverYouWant; // "foo"
  request.session.data.aNullableProp; // "not null anymore"
  request.session.data.object.foo; // "bar"
  request.session.data.object.bar; // 42

  return reply.send(
    "Cool value from session:" + request.session.data.object.baz,
  );
  // "Cool value from session: quxx"
};
```

then enjoy the session being available both in your controllers/handlers and in
your data store table/collection (linked to the Adapter you chosen in first step).

## Debugging

This library make use of the [`debug`](https://npmjs.com/package/debug) package,
thus it's possible to make the output of the program more verbose.

The plugin itself, and the adapters have their own "scopes" of logs so its possible
to troubleshoot only with logs from the plugin, or with logs from the adapter(s) or both.

```bash
# Syntax and examples:
# DEBUG=$scope:$subscope $(...command)

# Show all logs kinds from the customSession plugin
$ DEBUG=customSession:* yarn dev

# Show only trace logs from the customSession plugin
$ DEBUG=customSession:trace yarn dev

# Show only error logs from the customSession plugin
$ DEBUG=customSession:error yarn dev
```

**Note**: in this example, `$scope` could be:

- `customSession` ;
- `firebaseSessionAdapter` ;
- `mockSessionAdapter` ;
- `prismaSessionAdapter` ;
- `postgresSessionAdapter` ;
- `yourOwnSessionAdapter`.

## License

The [MIT](/LICENSE) license.
