import { NextResponse, type NextRequest } from "next/server";

/**
 * Strict Content Security Policy with a fresh nonce per request.
 * Scripts: only our own (nonce'd) scripts and what they load ('strict-dynamic'). No inline scripts from anywhere
 * else, no eval in production. Network: only Privy, WalletConnect and the Celo RPC. Framing: nobody may frame us.
 */
import { network } from "@/lib/network";

const RPC = network.rpcUrls;

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`, // Privy's modal uses inline styles; styles can't run code
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self' https://auth.privy.io https://*.rpc.privy.systems wss://relay.walletconnect.com wss://relay.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org https://api.web3modal.org wss://www.walletlink.org ${RPC.join(" ")}${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    `frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com`,
    `child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `report-uri /api/csp-report`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|icon.svg|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
