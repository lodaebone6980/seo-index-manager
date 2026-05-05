import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// DB Init
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      sitemap_url TEXT,
      rss_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      id SERIAL PRIMARY KEY,
      site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      title TEXT DEFAULT '',
      order_num INTEGER DEFAULT 0,
      source TEXT DEFAULT 'sitemap',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, url)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS index_requests (
      id SERIAL PRIMARY KEY,
      url_id INTEGER REFERENCES urls(id) ON DELETE CASCADE,
      engine TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      message TEXT DEFAULT '',
      requested_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_limits (
      id SERIAL PRIMARY KEY,
      engine TEXT NOT NULL,
      date DATE DEFAULT CURRENT_DATE,
      count INTEGER DEFAULT 0,
      max_limit INTEGER DEFAULT 100,
      UNIQUE(engine, date)
    )
  `);

  console.log('Database initialized');
}
initDB().catch(console.error);

// API Routes

// Get all sites
app.get('/api/sites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM urls WHERE site_id = s.id) as url_count,
        (SELECT COUNT(*) FROM index_requests ir JOIN urls u ON ir.url_id = u.id WHERE u.site_id = s.id AND ir.status = 'completed') as indexed_count
      FROM sites s ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add site
app.post('/api/sites', async (req, res) => {
  const { name, url, sitemap_url, rss_url } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO sites (name, url, sitemap_url, rss_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, url, sitemap_url, rss_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete site
app.delete('/api/sites/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sites WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// URL Extract (Sitemap & RSS)
app.post('/api/sites/:id/extract', async (req, res) => {
  const siteId = req.params.id;
  try {
    const siteResult = await pool.query('SELECT * FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const site = siteResult.rows[0];
    const extractedUrls = [];

    if (site.sitemap_url) {
      try {
        const sitemapUrls = await extractFromSitemap(site.sitemap_url);
        extractedUrls.push(...sitemapUrls.map(u => ({ ...u, source: 'sitemap' })));
      } catch (e) {
        console.error('Sitemap extraction error:', e.message);
      }
    }

    if (site.rss_url) {
      try {
        const rssUrls = await extractFromRSS(site.rss_url);
        extractedUrls.push(...rssUrls.map(u => ({ ...u, source: 'rss' })));
      } catch (e) {
        console.error('RSS extraction error:', e.message);
      }
    }

    if (!site.sitemap_url && !site.rss_url) {
      const baseUrl = site.url.replace(/\/$/, '');
      const attempts = [
        { url: `${baseUrl}/sitemap.xml`, type: 'sitemap' },
        { url: `${baseUrl}/sitemap_index.xml`, type: 'sitemap' },
        { url: `${baseUrl}/feed`, type: 'rss' },
        { url: `${baseUrl}/rss`, type: 'rss' },
        { url: `${baseUrl}/feed.xml`, type: 'rss' },
      ];

      for (const attempt of attempts) {
        try {
          if (attempt.type === 'sitemap') {
            const urls = await extractFromSitemap(attempt.url);
            if (urls.length > 0) {
              extractedUrls.push(...urls.map(u => ({ ...u, source: 'sitemap' })));
              await pool.query('UPDATE sites SET sitemap_url = $1 WHERE id = $2', [attempt.url, siteId]);
              break;
            }
          } else {
            const urls = await extractFromRSS(attempt.url);
            if (urls.length > 0) {
              extractedUrls.push(...urls.map(u => ({ ...u, source: 'rss' })));
              await pool.query('UPDATE sites SET rss_url = $1 WHERE id = $2', [attempt.url, siteId]);
            }
          }
        } catch (e) { /* skip */ }
      }
    }

    const uniqueUrls = [...new Map(extractedUrls.map(u => [u.url, u])).values()];

    let inserted = 0;
    for (let i = 0; i < uniqueUrls.length; i++) {
      const u = uniqueUrls[i];
      try {
        await pool.query(
          'INSERT INTO urls (site_id, url, title, order_num, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (site_id, url) DO UPDATE SET title = $3',
          [siteId, u.url, u.title || '', i + 1, u.source]
        );
        inserted++;
      } catch (e) { /* skip duplicates */ }
    }

    res.json({ total: uniqueUrls.length, inserted, urls: uniqueUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sitemap XML Parser
async function extractFromSitemap(sitemapUrl) {
  const response = await axios.get(sitemapUrl, { timeout: 15000 });
  const parsed = await parseStringPromise(response.data);
  const urls = [];

  if (parsed.sitemapindex) {
    const sitemaps = parsed.sitemapindex.sitemap || [];
    for (const sm of sitemaps) {
      const loc = sm.loc?.[0];
      if (loc) {
        try {
          const subUrls = await extractFromSitemap(loc);
          urls.push(...subUrls);
        } catch (e) { /* skip */ }
      }
    }
  }

  if (parsed.urlset) {
    const entries = parsed.urlset.url || [];
    for (const entry of entries) {
      const loc = entry.loc?.[0];
      if (loc) {
        urls.push({
          url: loc,
          title: entry['news:news']?.[0]?.['news:title']?.[0] || ''
        });
      }
    }
  }

  return urls;
}

// RSS/Atom Parser
async function extractFromRSS(rssUrl) {
  const response = await axios.get(rssUrl, { timeout: 15000 });
  const parsed = await parseStringPromise(response.data);
  const urls = [];

  if (parsed.rss) {
    const items = parsed.rss.channel?.[0]?.item || [];
    for (const item of items) {
      const link = item.link?.[0];
      if (link) {
        urls.push({ url: link, title: item.title?.[0] || '' });
      }
    }
  }

  if (parsed.feed) {
    const entries = parsed.feed.entry || [];
    for (const entry of entries) {
      const link = entry.link?.[0]?.$.href || entry.link?.[0];
      if (link) {
        urls.push({ url: link, title: entry.title?.[0]?._ || entry.title?.[0] || '' });
      }
    }
  }

  return urls;
}

// Get URLs for a site
app.get('/api/sites/:id/urls', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*,
        json_agg(json_build_object(
          'engine', ir.engine,
          'status', ir.status,
          'message', ir.message,
          'requested_at', ir.requested_at
        )) FILTER (WHERE ir.id IS NOT NULL) as index_status
      FROM urls u
      LEFT JOIN index_requests ir ON u.id = ir.url_id
      WHERE u.site_id = $1
      GROUP BY u.id
      ORDER BY u.order_num ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add URLs manually
app.post('/api/sites/:id/urls', async (req, res) => {
  const { urls } = req.body;
  try {
    const inserted = [];
    for (const u of urls) {
      const result = await pool.query(
        'INSERT INTO urls (site_id, url, title, source) VALUES ($1, $2, $3, $4) ON CONFLICT (site_id, url) DO NOTHING RETURNING *',
        [req.params.id, u.url, u.title || '', 'manual']
      );
      if (result.rows[0]) inserted.push(result.rows[0]);
    }
    res.json({ inserted: inserted.length, urls: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Index request
app.post('/api/index-request', async (req, res) => {
  const { url_id, engine } = req.body;
  try {
    const limitCheck = await pool.query(
      'SELECT * FROM daily_limits WHERE engine = $1 AND date = CURRENT_DATE',
      [engine]
    );

    if (limitCheck.rows.length > 0 && limitCheck.rows[0].count >= limitCheck.rows[0].max_limit) {
      return res.json({
        success: false,
        message: `${engine} daily limit (${limitCheck.rows[0].max_limit}) reached.`,
        limit_reached: true
      });
    }

    const result = await pool.query(
      'INSERT INTO index_requests (url_id, engine, status, requested_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [url_id, engine, 'requesting']
    );

    await pool.query(`
      INSERT INTO daily_limits (engine, date, count) VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (engine, date) DO UPDATE SET count = daily_limits.count + 1
    `, [engine]);

    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update index request status
app.patch('/api/index-request/:id', async (req, res) => {
  const { status, message } = req.body;
  try {
    const completedAt = status === 'completed' || status === 'failed' ? 'NOW()' : 'NULL';
    const result = await pool.query(
      `UPDATE index_requests SET status = $1, message = $2, completed_at = ${completedAt} WHERE id = $3 RETURNING *`,
      [status, message || '', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sites) as total_sites,
        (SELECT COUNT(*) FROM urls) as total_urls,
        (SELECT COUNT(*) FROM index_requests WHERE status = 'completed') as indexed_count,
        (SELECT COUNT(*) FROM index_requests WHERE status = 'pending') as pending_count,
        (SELECT COUNT(*) FROM index_requests WHERE status = 'failed') as failed_count
    `);

    const engineStats = await pool.query(`
      SELECT engine,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM index_requests
      GROUP BY engine
    `);

    const recentActivity = await pool.query(`
      SELECT ir.*, u.url, u.title
      FROM index_requests ir
      JOIN urls u ON ir.url_id = u.id
      ORDER BY ir.created_at DESC
      LIMIT 20
    `);

    const dailyLimits = await pool.query(
      'SELECT * FROM daily_limits WHERE date = CURRENT_DATE'
    );

    res.json({
      overview: stats.rows[0],
      by_engine: engineStats.rows,
      recent_activity: recentActivity.rows,
      daily_limits: dailyLimits.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily limits settings
app.post('/api/settings/limits', async (req, res) => {
  const { engine, max_limit } = req.body;
  try {
    await pool.query(`
      INSERT INTO daily_limits (engine, date, count, max_limit) VALUES ($1, CURRENT_DATE, 0, $2)
      ON CONFLICT (engine, date) DO UPDATE SET max_limit = $2
    `, [engine, max_limit]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Queue - get next URL for engine
app.get('/api/queue/:engine', async (req, res) => {
  const { engine } = req.params;
  const { site_id } = req.query;
  try {
    let query = `
      SELECT u.id as url_id, u.url, u.title, u.site_id, s.name as site_name
      FROM urls u
      JOIN sites s ON u.site_id = s.id
      WHERE u.id NOT IN (
        SELECT url_id FROM index_requests WHERE engine = $1 AND status IN ('completed', 'requesting')
      )
    `;
    const params = [engine];

    if (site_id) {
      query += ' AND u.site_id = $2';
      params.push(site_id);
    }

    query += ' ORDER BY u.order_num ASC LIMIT 1';

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.json({ done: true, message: 'All URLs processed.' });
    }

    res.json({ done: false, next: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obsidian markdown export
app.get('/api/export/obsidian', async (req, res) => {
  try {
    const sites = await pool.query('SELECT * FROM sites ORDER BY name');
    const stats = await pool.query(`
      SELECT u.site_id, ir.engine, ir.status, COUNT(*) as cnt
      FROM index_requests ir
      JOIN urls u ON ir.url_id = u.id
      GROUP BY u.site_id, ir.engine, ir.status
    `);

    const dailyLimits = await pool.query(
      'SELECT * FROM daily_limits WHERE date = CURRENT_DATE'
    );

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let md = '# SEO Index Status\n\n';
    md += `> Last updated: ${now}\n\n`;

    const overview = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM urls) as total_urls,
        (SELECT COUNT(DISTINCT url_id) FROM index_requests WHERE status = 'completed') as indexed,
        (SELECT COUNT(DISTINCT url_id) FROM index_requests WHERE status = 'failed') as failed
    `);
    const ov = overview.rows[0];
    md += '## Summary\n\n';
    md += '| Item | Count |\n|------|-------|\n';
    md += `| Total URLs | ${ov.total_urls} |\n`;
    md += `| Indexed | ${ov.indexed} |\n`;
    md += `| Failed | ${ov.failed} |\n\n`;

    if (dailyLimits.rows.length > 0) {
      md += '## Daily Limits\n\n';
      md += '| Engine | Count | Limit |\n|--------|-------|-------|\n';
      for (const dl of dailyLimits.rows) {
        md += `| ${dl.engine} | ${dl.count} | ${dl.max_limit} |\n`;
      }
      md += '\n';
    }

    for (const site of sites.rows) {
      md += `## ${site.name}\n\n`;
      md += `- URL: ${site.url}\n`;
      if (site.sitemap_url) md += `- Sitemap: ${site.sitemap_url}\n`;
      if (site.rss_url) md += `- RSS: ${site.rss_url}\n`;
      md += '\n';

      const siteStats = stats.rows.filter(s => s.site_id === site.id);
      if (siteStats.length > 0) {
        md += '| Engine | Status | Count |\n|--------|--------|-------|\n';
        for (const s of siteStats) {
          const statusMap = { completed: 'Done', pending: 'Pending', failed: 'Failed', requesting: 'In Progress' };
          md += `| ${s.engine} | ${statusMap[s.status] || s.status} | ${s.cnt} |\n`;
        }
        md += '\n';
      }
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="SEO-Index-Status.md"');
    res.send(md);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEO Index Manager running on port ${PORT}`));
