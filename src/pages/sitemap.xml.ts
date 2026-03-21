import tools from "../data/tools.json";

type ToolItem = {
  slug: string;
  category: string;
};

const allTools = tools as ToolItem[];

const categorySlugs = [
  "developer-tools",
  "network-tools",
  "text-tools",
  "converters",
  "calculators"
];

function buildUrl(loc: string, lastmod?: string) {
  return `
  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
  </url>`;
}

export async function GET() {
  const base = "https://toolsatlas.dev";
  const today = new Date().toISOString().split("T")[0];

  const urls: string[] = [];

  urls.push(buildUrl(`${base}/`, today));
  urls.push(buildUrl(`${base}/tools/`, today));

  for (const category of categorySlugs) {
    urls.push(buildUrl(`${base}/tools/category/${category}`, today));
  }

  for (const tool of allTools) {
    urls.push(buildUrl(`${base}/tools/${tool.slug}`, today));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("")}
</urlset>`;

  return new Response(xml.trim(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}