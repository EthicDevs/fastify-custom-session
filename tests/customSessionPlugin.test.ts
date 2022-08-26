// std
import type { IncomingMessage, Server, ServerResponse } from "http";
// 3rd-party
import fastifyCookie from "@fastify/cookie";
import fastify, { FastifyInstance, FastifyLoggerInstance } from "fastify";
// lib
import type { CustomSession } from "../src/types";
import { MockSessionAdapter } from "../src/adapters/mock";
import { makePlugin } from "../src/pluginFactory";

const setTimeoutBypassingFakes = global.setTimeout;

const sleep = (time: number = 100) =>
  new Promise((resolve) => {
    setTimeoutBypassingFakes(() => {
      resolve(undefined);
    }, time);
  });

describe("@ethicdevs/fastify-custom-session", () => {
  let app: FastifyInstance<
    Server,
    IncomingMessage,
    ServerResponse,
    FastifyLoggerInstance
  > = fastify();

  let mockStoreAdapter = new MockSessionAdapter({});

  const fastifyCustomSession = makePlugin();
  // make the uniqId not uniq for the tests duration.
  const testUniqId = "test_session_id";
  const getUniqId = () => testUniqId;

  // initial data in session
  const initialSession: CustomSession = {
    whateverYouWant: "<unset>",
    aNullableProp: null,
    mySuperObject: {
      foo: "<unset>",
      bar: 0,
      baz: "<unset>",
    },
  };

  beforeEach(() => {
    app = fastify();
  });

  afterEach(async () => {
    mockStoreAdapter.clear();
    await app.close();
  });

  it(`should create a new session and reply with a new cookie`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      initialSession,
      storeAdapter: mockStoreAdapter,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = "test it works!";
        reply.send(request.session.id);
      },
    });

    // When
    const response = await app.inject({
      method: "GET",
      url: "/set-session",
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(session!.expiresAtEpoch).toBeNull();
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual(initialSession);

    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo; Domain=.my-app.com; Path=/; HttpOnly; SameSite=Lax"`,
    );

    expect(response.body).toStrictEqual(testUniqId);
  });

  it(`should create a new session and reply with a new cookie with expiry time when given the 'options.ttl' opt`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      initialSession,
      storeAdapter: mockStoreAdapter,
      //> THE BRANCH >
      ttl: 30, // seconds
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = "test it works!";
        reply.send(request.session.id);
      },
    });

    // When
    const response = await app.inject({
      method: "GET",
      url: "/set-session",
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(session!.expiresAtEpoch).toBeGreaterThan(0);
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual(initialSession);

    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo; Max-Age=30; Domain=.my-app.com; Path=/; HttpOnly; SameSite=Lax"`,
    );

    expect(response.body).toStrictEqual(testUniqId);
  });

  it(`should read existing session from 'storeAdapter' and reply WITHOUT a new cookie`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    const expectedWhateverYouWant = "second time test it works!";

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      storeAdapter: mockStoreAdapter,
      initialSession,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = expectedWhateverYouWant;
        reply.send(request.session.id);
      },
    });

    const secondResponse = await app.inject({
      method: "GET",
      url: "/set-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(session!.expiresAtEpoch).toBeNull();
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual({
      ...initialSession,
      whateverYouWant: expectedWhateverYouWant,
    });

    expect(secondResponse.headers["set-cookie"]).not.toBeDefined();
    expect(secondResponse.body).toStrictEqual(testUniqId);
  });

  it(`should read existing session from 'storeAdapter' and destroy it when it has expired in time`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    let expectedWhateverYouWant = "test it works!";
    const sessionTTL = 2; // seconds

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      storeAdapter: mockStoreAdapter,
      initialSession,
      //> THE BRANCH >
      ttl: sessionTTL,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = expectedWhateverYouWant;
        reply.send(request.session.id);
      },
    });

    // firstSetRequest
    await app.inject({
      method: "GET",
      url: "/set-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    // give time for session to expire
    await sleep(sessionTTL * 2 * 1000);

    // change the session data
    expectedWhateverYouWant = "new session";

    const secondNow = Date.now();
    const expiredResponse = await app.inject({
      method: "GET",
      url: "/set-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);
    const expectedNextExpiresAt = Math.floor(secondNow / 1000) + sessionTTL;

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(Math.floor(session!.expiresAtEpoch! / 1000)).toStrictEqual(
      expectedNextExpiresAt,
    );
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual({
      ...initialSession,
      whateverYouWant: expectedWhateverYouWant,
    });

    expect(expiredResponse.headers["set-cookie"]).toBeDefined();
    expect(expiredResponse.headers["set-cookie"]).not.toBeNull();
    expect(expiredResponse.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=; Domain=.my-app.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"`,
    );
    expect(expiredResponse.body).toStrictEqual(testUniqId);
  });

  it(`should destroy the session when 'request.session.destroy' is called`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      storeAdapter: mockStoreAdapter,
      initialSession,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = "set test it works!";
        reply.send(request.session.id);
      },
    });

    // some route that destroy the session
    app.get("/destroy-session", {
      handler: async (request, reply) => {
        await request.session.destroy();
        reply.send(request.session.id);
      },
    });

    // createResponse
    await app.inject({
      method: "GET",
      url: "/set-session",
    });

    // setResponse
    await app.inject({
      method: "GET",
      url: "/set-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    const destroyResponse = await app.inject({
      method: "GET",
      url: "/destroy-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session).toBeNull();

    expect(destroyResponse.headers["set-cookie"]).toBeDefined();
    expect(destroyResponse.headers["set-cookie"]).not.toBeNull();
    expect(destroyResponse.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=; Domain=.my-app.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"`,
    );
  });

  it(`should create a new session after 'request.session.destroy' has previously been called`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      storeAdapter: mockStoreAdapter,
      initialSession,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = "set test it works!";
        reply.send(request.session.id);
      },
    });

    // some route that destroy the session
    app.get("/destroy-session", {
      handler: async (request, reply) => {
        await request.session.destroy();
        reply.send(request.session.id);
      },
    });

    // createResponse
    await app.inject({
      method: "GET",
      url: "/set-session",
    });

    // setResponse
    await app.inject({
      method: "GET",
      url: "/set-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    // destroyResponse
    await app.inject({
      method: "GET",
      url: "/destroy-session",
      headers: {
        cookie: `my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo;`,
      },
    });

    const recreateResponse = await app.inject({
      method: "GET",
      url: "/set-session",
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(session!.expiresAtEpoch).toBeNull();
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual(initialSession);

    expect(recreateResponse.headers["set-cookie"]).toBeDefined();
    expect(recreateResponse.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo; Domain=.my-app.com; Path=/; HttpOnly; SameSite=Lax"`,
    );

    expect(recreateResponse.body).toStrictEqual(testUniqId);
  });

  it(`should expires the session when 'request.session.expiresAtEpoch' is set to -1`, async () => {
    // Given
    const cookieName = "my_app_sid"; // or better: Env.COOKIE_NAME
    const cookieSecret = "super-secret-session-secret"; // or better: Env.SESSION_SECRET
    const cookieOptions = {
      domain: `.my-app.com`, // or better: `.${Env.DEPLOYMENT_DOMAIN}`,
      httpOnly: true,
      path: "/",
      secure: false,
      sameSite: "lax" as const,
      signed: true,
    };

    // register the fastifyCookie plugin
    app.register(fastifyCookie, {
      secret: cookieSecret,
      parseOptions: cookieOptions,
    });

    // register the customSession plugin
    app.register(fastifyCustomSession, {
      password: cookieSecret,
      getUniqId,
      cookieName,
      cookieOptions,
      storeAdapter: mockStoreAdapter,
      initialSession,
    });

    // some route that set some session data
    app.get("/set-session", {
      handler: (request, reply) => {
        request.session.data.whateverYouWant = "set it test it works!";
        reply.send(request.session.id);
      },
    });

    // some route that destroy the session
    app.get("/expire-session", {
      handler: (request, reply) => {
        request.session.expiresAtEpoch = -1;
        reply.send(request.session.id);
      },
    });

    // createResponse
    await app.inject({
      method: "GET",
      url: "/set-session",
    });

    const expireResponse = await app.inject({
      method: "GET",
      url: "/expire-session",
    });

    const session = mockStoreAdapter.readSessionById(testUniqId);

    // Then
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
    expect(session!.id).not.toBeNull();
    expect(session!.id).toStrictEqual(testUniqId);
    expect(session!.createdAtEpoch).toBeDefined();
    expect(session!.createdAtEpoch).not.toBeNull();
    expect(session!.updatedAtEpoch).toBeDefined();
    expect(session!.updatedAtEpoch).not.toBeNull();
    expect(session!.expiresAtEpoch).toBeDefined();
    expect(session!.expiresAtEpoch).toBeNull();
    expect(session!.data).toBeDefined();
    expect(session!.data).not.toBeNull();
    expect(session!.data).toStrictEqual(initialSession);

    expect(expireResponse.headers["set-cookie"]).toBeDefined();
    expect(expireResponse.headers["set-cookie"]).not.toBeNull();
    expect(expireResponse.headers["set-cookie"]).toMatchInlineSnapshot(
      `"my_app_sid=test_session_id.IT8IProHCcbX10wxOHzIi5RXc65Lkxyd6t5HGWc93Xo; Domain=.my-app.com; Path=/; HttpOnly; SameSite=Lax"`,
    );
  });
});
