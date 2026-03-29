import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { spawn } from "node:child_process";
import dns from "node:dns/promises";

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

async function fetchRemoteText(targetUrl: string): Promise<{ text: string; status: number }> {
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
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 10000
      },
      (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk.toString();
        });

        res.on("end", () => {
          resolve({
            text: body,
            status: res.statusCode || 0
          });
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

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaContent(html: string, attrName: "name" | "property", attrValue: string): string {
  const regex = new RegExp(
    `<meta[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrValue}["'][^>]*>`,
    "i"
  );

  const match = html.match(regex);
  return decodeHtml((match?.[1] || match?.[2] || "").trim());
}
function requestWithTiming(targetUrl: string): Promise<{ url: string; status: number; responseTimeMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
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
        res.resume();

        resolve({
          url: targetUrl,
          status: res.statusCode || 0,
          responseTimeMs: Date.now() - started
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

function runTraceroute(targetHost: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";

    const cmd = isWindows ? "tracert" : "traceroute";
    const args = isWindows ? ["-d", targetHost] : ["-n", targetHost];

    const child = spawn(cmd, args, { timeout: 20000 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", () => {
      const text = `${stdout}\n${stderr}`;
      const lines = text.split(/\r?\n/);

      const hops = lines
        .map((line: string) => line.trim())
        .filter((line: string) => /^\d+\s+/.test(line))
        .map((line: string) => {
          const hopMatch = line.match(/^(\d+)/);
          const ipMatch = line.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
          const timeMatch = line.match(/(\d+)\s*ms/i);

          return {
            hop: hopMatch ? Number(hopMatch[1]) : null,
            ip: ipMatch ? ipMatch[0] : "",
            host: ipMatch ? ipMatch[0] : line,
            timeMs: timeMatch ? Number(timeMatch[1]) : null
          };
        })
        .filter((item: any) => Number.isFinite(item.hop));

      resolve(hops);
    });
  });
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

    if (type === "meta-tags") {
      const targetUrl = normalizeUrl(target);
      const { text } = await fetchRemoteText(targetUrl);

      const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const canonicalMatch = text.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i);

      return json({
        url: targetUrl,
        title: decodeHtml((titleMatch?.[1] || "").replace(/\s+/g, " ").trim()),
        metaDescription: extractMetaContent(text, "name", "description"),
        metaRobots: extractMetaContent(text, "name", "robots"),
        viewport: extractMetaContent(text, "name", "viewport"),
        canonical: decodeHtml((canonicalMatch?.[1] || "").trim()),
        ogTitle: extractMetaContent(text, "property", "og:title"),
        ogDescription: extractMetaContent(text, "property", "og:description")
      });
    }

    if (type === "sitemap") {
      const normalized = normalizeUrl(target);
      const origin = new URL(normalized).origin;

      const candidates = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemap-index.xml`
      ];

      for (const candidate of candidates) {
        try {
          const { text, status } = await fetchRemoteText(candidate);

          if (!text) continue;

          const isUrlSet = /<urlset\b/i.test(text);
          const isSitemapIndex = /<sitemapindex\b/i.test(text);

          if (!isUrlSet && !isSitemapIndex) {
            continue;
          }

          const urlEntries = (text.match(/<url>/gi) || []).length;
          const sitemapEntries = (text.match(/<sitemap>/gi) || []).length;

          return json({
            checkedUrl: candidate,
            found: true,
            status,
            type: isSitemapIndex ? "sitemapindex" : "urlset",
            urlEntries,
            sitemapEntries
          });
        } catch {
        }
      }

      return json({
        checkedUrl: `${origin}/sitemap.xml`,
        found: false,
        status: "n/a"
      });
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
        if (type === "response-time") {
      const targetUrl = normalizeUrl(target);
      const data = await requestWithTiming(targetUrl);
      return json(data);
    }

    if (type === "website-status") {
      const targetUrl = normalizeUrl(target);
      const data = await requestWithTiming(targetUrl);

      return json({
        url: data.url,
        status: data.status
      });
    }

    if (type === "traceroute") {
      const host = extractHost(target);
      const hops = await runTraceroute(host);

      return json({
        target: host,
        hops
      });
    }
        if (type === "hostname-to-ip") {
      let hostname = String(target || "").trim();

      try {
        if (/^https?:\/\//i.test(hostname)) {
          hostname = new URL(hostname).hostname;
        }
      } catch {
        return json({ error: "Invalid URL" }, 200);
      }

      if (!hostname) {
        return json({ error: "Invalid hostname" }, 200);
      }

      try {
        const [ipv4Raw, ipv6Raw] = await Promise.allSettled([
          dns.resolve4(hostname),
          dns.resolve6(hostname)
        ]);

        const ipv4 =
          ipv4Raw.status === "fulfilled" && Array.isArray(ipv4Raw.value)
            ? ipv4Raw.value
            : [];

        const ipv6 =
          ipv6Raw.status === "fulfilled" && Array.isArray(ipv6Raw.value)
            ? ipv6Raw.value
            : [];

        if (!ipv4.length && !ipv6.length) {
          return json({
            error: "No IP records found for this hostname."
          }, 200);
        }

        return json({
          hostname,
          ipv4,
          ipv6
        });
      } catch {
        return json({
          error: "Unable to resolve hostname."
        }, 200);
      }
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