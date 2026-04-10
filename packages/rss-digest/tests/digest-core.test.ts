import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSON, parseRSSItems } from '../src/digest-core.js';

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
