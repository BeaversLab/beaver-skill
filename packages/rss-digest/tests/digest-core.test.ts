import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { parseJSON, parseRSSItems, runDigest } from '../src/digest-core.js';

test('parseRSSItems keeps RSS items when fields are wrapped in CDATA', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss>
    <channel>
      <item>
        <title><![CDATA[Hello RSS]]></title>
        <link><![CDATA[https://example.com/rss]]></link>
        <pubDate><![CDATA[Fri, 11 Apr 2026 10:00:00 GMT]]></pubDate>
        <description><![CDATA[<p>RSS body</p>]]></description>
      </item>
    </channel>
  </rss>`;

  assert.deepEqual(parseRSSItems(xml), [
    {
      title: 'Hello RSS',
      link: 'https://example.com/rss',
      pubDate: 'Fri, 11 Apr 2026 10:00:00 GMT',
      description: '<p>RSS body</p>',
    },
  ]);
});

test('parseRSSItems keeps Atom entries when title and content are wrapped in CDATA', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title><![CDATA[Hello Atom]]></title>
      <link href="https://example.com/atom" />
      <updated><![CDATA[2026-04-11T10:00:00Z]]></updated>
      <summary><![CDATA[<div>Atom body</div>]]></summary>
    </entry>
  </feed>`;

  assert.deepEqual(parseRSSItems(xml), [
    {
      title: 'Hello Atom',
      link: 'https://example.com/atom',
      pubDate: '2026-04-11T10:00:00Z',
      description: '<div>Atom body</div>',
    },
  ]);
});

test('parseJSON parses fenced JSON blocks', () => {
  assert.deepEqual(parseJSON<{ results: number[] }>('```json\n{"results":[1,2]}\n```'), {
    results: [1, 2],
  });
});

test('parseJSON extracts object JSON from mixed prose', () => {
  const payload = `下面是结果，请直接使用：\n{"results":[{"score":88}]}\n谢谢。`;
  assert.deepEqual(parseJSON<{ results: Array<{ score: number }> }>(payload), {
    results: [{ score: 88 }],
  });
});

test('parseJSON extracts array JSON from mixed prose', () => {
  const payload = `分析完成。\n[{"id":1},{"id":2}]\n以上。`;
  assert.deepEqual(parseJSON<Array<{ id: number }>>(payload), [{ id: 1 }, { id: 2 }]);
});

test('runDigest writes final report to stdout when stdout mode is enabled', async () => {
  const originalFetch = globalThis.fetch;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const stdoutChunks: string[] = [];
  const templatesDir = await mkdtemp(path.join(os.tmpdir(), 'rss-digest-templates-'));

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  await mkdir(templatesDir, { recursive: true });
  await writeFile(
    path.join(templatesDir, 'default.md'),
    '# {{reportTitle}}\n\n{{highlightsSection}}\n\n{{articlesSection}}\n',
    'utf8'
  );

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (url === 'https://example.com/feed.xml') {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <rss><channel><item>
          <title><![CDATA[Hello RSS]]></title>
          <link>https://example.com/article</link>
          <pubDate>Fri, 11 Apr 2026 10:00:00 GMT</pubDate>
          <description><![CDATA[Short desc]]></description>
        </item></channel></rss>`,
        { status: 200 }
      );
    }
    if (url === 'https://example.com/article') {
      return new Response('<article><p>Expanded article body</p></article>', { status: 200 });
    }
    if (url === 'https://mock-llm.example.com/v1/messages') {
      const body = JSON.parse((input as Request).body ? await (input as Request).text() : '{}') as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('highlights') || prompt.includes('看点')) {
        return Response.json({
          content: [{ type: 'text', text: '- Highlight item' }],
        });
      }
      if (prompt.includes('summary') || prompt.includes('总结')) {
        return Response.json({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: [
                  { index: 0, titleZh: 'Hello RSS', summary: 'Summary body', reason: 'Reason' },
                ],
              }),
            },
          ],
        });
      }
      return Response.json({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                {
                  index: 0,
                  relevance: 9,
                  quality: 9,
                  timeliness: 9,
                  category: 'other',
                  keywords: ['rss'],
                },
              ],
            }),
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const result = await runDigest({
      feeds: [
        {
          name: 'Example Feed',
          xmlUrl: 'https://example.com/feed.xml',
          htmlUrl: 'https://example.com',
        },
      ],
      prompts: {
        scoring: '',
        summary: '',
        highlights: '',
      },
      hours: 24 * 365,
      topN: 1,
      language: 'en',
      outputPath: '/tmp/unused.md',
      stdout: true,
      llms: [
        {
          enabled: true,
          provider: 'mock',
          apiType: 'anthropic-compatible',
          baseUrl: 'https://mock-llm.example.com',
          model: 'mock-model',
        },
      ],
      llmApiKey: 'test-key',
      categories: [{ id: 'other', emoji: '📝', label: 'Other' }],
      reportTemplate: 'default',
      i18n: {
        'report.title': 'Report',
        'summary.sectionTitle': 'Highlights',
        'chart.categoryTitle': 'Categories',
      },
      templatesDir,
    });

    assert.equal(result.outputPath, '[stdout]');
    assert.match(stdoutChunks.join(''), /Report/);
    assert.match(stdoutChunks.join(''), /Hello RSS/);
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalStdoutWrite;
    await rm(templatesDir, { recursive: true, force: true });
  }
});
