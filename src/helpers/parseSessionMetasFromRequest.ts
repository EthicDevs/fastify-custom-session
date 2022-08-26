import { FastifyRequest } from "fastify";

export function parseSessionMetasFromRequest(request: FastifyRequest): {
  detectedIPAddress?: string;
  detectedUserAgent?: string;
} {
  const ipAddresses = (request?.ips || [request.ip]).filter(
    (ip) => ip !== "127.0.0.1",
  );

  const detectedIPAddress =
    ipAddresses.length >= 1 ? ipAddresses[0] : undefined;

  const detectedUserAgent =
    request.headers["user-agent"] != null &&
    request.headers["user-agent"].trim() !== ""
      ? request.headers["user-agent"]
      : undefined;

  return {
    detectedIPAddress,
    detectedUserAgent,
  };
}
