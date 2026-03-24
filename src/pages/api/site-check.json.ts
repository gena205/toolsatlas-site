import http from "node:http";
import https from "node:https";
import tls from "node:tls";

export const prerender = false;

type RedirectStep = {
  url: string;
  status: number;
  location: string | null;
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeUrl(input: string): string {
  let value = String(input || "").trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

function extractHost(input: string): string {
  const url = new URL(normalizeUrl(input));
  return url.hostname;
}

function requestOnce(targetUrl: string): Promise<RedirectStep> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const lib = urlObj.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || undefined,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "GET",
        headers: {
          "User-Agent": "ToolsAtlas/1.0",
          "Accept": "*/*"
        },
        timeout: 10000
      },
      (res) => {
        const locationHeader = res.headers.location;
        const location =
          typeof locationHeader === "string"
            ? new URL(locationHeader, targetUrl).toString()
            : null;

        res.resume();

        resolve({
          url: targetUrl,
          status: res.statusCode || 0,
          location
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });

    req.on("error", reject);
    req.end();
  });
}

async function traceRedirects(input: string): Promise<{
  inputUrl: string;
  finalUrl: string;
  redirectDetected: boolean;
  chain: RedirectStep[];
}> {
  let currentUrl = normalizeUrl(input);
  const chain: RedirectStep[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < 10; i++) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    const step = await requestOnce(currentUrl);
    chain.push(step);

    if (
      step.location &&
      [301, 302, 303, 307, 308].includes(step.status)
    ) {
      currentUrl = step.location;
      continue;
    }

    break;
  }

  return {
    inputUrl: normalizeUrl(input),
    finalUrl: chain.length ? (chain[chain.length - 1].location || chain[chain.length - 1].url) : normalizeUrl(input),
    redirectDetected: chain.some((step) => !!step.location),
    chain
  };
}

function getCertificate(host: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        timeout: 10000
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const protocol = socket.getProtocol();
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            reject(new Error("No certificate"));
            return;
          }

          resolve({
            subject: cert.subject || null,
            issuer: cert.issuer || null,
            subjectaltname: cert.subjectaltname || "",
            valid_from: cert.valid_from || "",
            valid_to: cert.valid_to || "",
            serialNumber: cert.serialNumber || "",
            fingerprint: cert.fingerprint || "",
            fingerprint256: cert.fingerprint256 || "",
            bits: cert.bits || null,
            pubkeyAlgorithm: (cert as any).asymmetricKeyType || "",
            protocol: protocol || ""
          });
        } catch (error) {
          reject(error);
        }
      }
    );

    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy(new Error("timeout"));
    });
  });
}

function testTlsVersion(host: string, version: "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        minVersion: version,
        maxVersion: version,
        timeout: 8000
      },
      () => {
        socket.end();
        resolve(true);
      }
    );

    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function getTlsVersions(host: string) {
  const versions: Array<"TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3"> = [
    "TLSv1",
    "TLSv1.1",
    "TLSv1.2",
    "TLSv1.3"
  ];

  const supported: string[] = [];

  for (const version of versions) {
    const ok = await testTlsVersion(host, version);
    if (ok) supported.push(version);
  }

  return supported;
}

export async function GET({ url }: { url: URL }) {
  const type = url.searchParams.get("type") || "";
  const target = url.searchParams.get("target") || "";

  if (!type || !target) {
    return json({ error: "Missing type or target" }, 400);
  }

  try {
    if (type === "redirect") {
      const data = await traceRedirects(target);
      return json(data);
    }

    const host = extractHost(target);

    if (type === "ssl-cert") {
      const cert = await getCertificate(host);
      return json({
        domain: host,
        subject: cert.subject,
        issuer: cert.issuer,
        subjectaltname: cert.subjectaltname,
        valid_from: cert.valid_from,
        valid_to: cert.valid_to,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        fingerprint256: cert.fingerprint256,
        bits: cert.bits,
        pubkeyAlgorithm: cert.pubkeyAlgorithm,
        negotiatedProtocol: cert.protocol
      });
    }

    if (type === "ssl-expiry") {
      const cert = await getCertificate(host);
      const expiresAt = new Date(cert.valid_to);
      const diffMs = expiresAt.getTime() - Date.now();
      const daysLeft = Number.isFinite(diffMs)
        ? Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        : null;

      return json({
        domain: host,
        valid_to: cert.valid_to,
        daysLeft
      });
    }

    if (type === "tls-version") {
      const supported = await getTlsVersions(host);
      return json({
        domain: host,
        supportedProtocols: supported
      });
    }

    return json({ error: "Unsupported type" }, 400);
  } catch (error: any) {
    return json(
      {
        error: error?.message || "Request failed"
      },
      500
    );
  }
}