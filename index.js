const Url = require('url');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.load();

const NO_QIITA = 'NO_QIITA';
const QIITA_TOKEN = process.env.QIITA_TOKEN;


(function main() {
  getRankingEntries()
    .then(map(formatRankingEntry))
    .then((text) => text.join('\n\n'))
    .then(console.log.bind(console))
    .catch((err) => console.error(err.stack || String(err)))
})();

function getRankingEntries() {
  return getAdventCalendarUrls()
    .then((urls) => Promise.all([
      urls,
      getTitles(urls),
      getHatenaBookmarkCounts(urls),
      getQiitaStockCounts(urls),
    ]))
    .then(zip)
    .then(map((tuple) => ({
      url: tuple[0],
      title: tuple[1],
      hatenaBookmark: tuple[2],
      qiitaStock: tuple[3],
    })))
    .then(sort((entryA, entryB) => numberCompare(
      getRankingScore(entryB), getRankingScore(entryA))))
}

function formatRankingEntry(entry) {
  const detailItems = [
    `URL: ${entry.url}`,
    `はてなブックマーク数: ${entry.hatenaBookmark}`,
    `Qiitaストック数: ${entry.qiitaStock}`,
  ].map((line) => `\t${line}`);

  return [`${entry.title}:`].concat(detailItems).join('\n');
}

function getRankingScore(rankingEntry) {
  if (rankingEntry.qiitaStock === NO_QIITA) {
    return rankingEntry.hatenaBookmark;
  }

  return rankingEntry.hatenaBookmark + rankingEntry.qiitaStock;
}

function getHatenaBookmarkCounts(urls) {
  const queries = urls.map((url) => `url=${encodeURIComponent(url)}`).join('&');

  return fetch(`http://api.b.st-hatena.com/entry.counts?${queries}`)
    .then((res) => res.json())
    .then((map) => urls.map((url) => map[url]));
}

function getQiitaStockCount(url) {
  if (!isQiitaUrl(url)) return NO_QIITA;
  const qiitaItem = parseQiitaItemUrl(url);

  return getQiitaStockCountByPage(qiitaItem.id, 1);

  function getQiitaStockCountByPage(itemId, page) {
    const MAX_PER_PAGE = 100;
    const apiUrl = `https://qiita.com/api/v2/items/${itemId}/stockers?page=${page}&per_page=${MAX_PER_PAGE}`;
    const options = { headers: { Authorization: `Bearer ${QIITA_TOKEN}` } };

    return disperseExec(5000)
      .then(() => fetch(apiUrl, options))
      .then((res) => res.json())
      .then((stockers) => stockers.length)
      .then((stockersCount) => stockersCount === MAX_PER_PAGE
        ? getQiitaStockCountByPage(itemId, page + 1)
        : stockersCount);
  }
}

function getQiitaStockCounts(urls) {
  return Promise.all(urls.map(getQiitaStockCount));
}

function parseQiitaItemUrl(url) {
  const paths = Url.parse(url).pathname.split('/');
  return {
    username: paths[1],
    id: paths[3],
  };
}

function isQiitaUrl(url) {
  return Url.parse(url).hostname === 'qiita.com';
}

function getAdventCalendarUrls() {
  return fetch('http://qiita.com/advent-calendar/2015/mixi')
    .then((res) => res.text())
    .then((html) => cheerio.load(html))
    .then(($) => $('.adventCalendarItem_entry a').map((idx, a) => $(a).attr('href')).get());
}

function getTitle(url) {
  return fetch(url)
    .then((res) => res.text())
    .then((html) => cheerio.load(html))
    .then(($) => $('title').text());
}

function getTitles(urls) {
  return Promise.all(urls.map(getTitle));
}

function zip(arrays) {
  const minLength = Math.min
    .apply(Math, arrays.map((array) => array.length));

  return range(0, minLength)
    .map((i) => arrays.map((array) => array[i]));
}

function range(start, end) {
  const result = [];
  const greater = Math.max(start, end);
  const lower = Math.min(start, end);

  for (var i = lower; i < greater; i++) {
    result.push(i);
  }

  return result;
}

function sort(compare) {
  return (array) => [].concat(array).sort(compare);
}

function numberCompare(a, b) {
  return a === b ? 0 : a > b ? 1 : -1;
}

function map(fn) {
  return (array) => array.map(fn);
}

function spy(x) {
  console.log(x);
  return x;
}

function disperseExec(maxDurationTime) {
  const durationMsec = Math.random() * maxDurationTime;

  return new Promise((resolve) => {
    setTimeout(resolve, durationMsec);
  });
}
