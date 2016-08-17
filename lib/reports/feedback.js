'use strict';

const all = {},
  byUa = {},
  byDomain = {};

let config;

function onData(dateIndex, parsedEvent) {
  if (parsedEvent.name !== 'feedback-sent') {
    return;
  }
  const rating = parsedEvent.details.rating,
    ua = parsedEvent.meta.ua.browser,
    domain = parsedEvent.meta.domain,
    text = parsedEvent.details.feedbackText || '';

  if (!all[rating]) {
    all[rating] = [];
  }
  if (!byUa[ua]) {
    byUa[ua] = {};
  }
  if (!byUa[ua][rating]) {
    byUa[ua][rating] = [];
  }
  if (!byDomain[domain]) {
    byDomain[domain] = {};
  }
  if (!byDomain[domain][rating]) {
    byDomain[domain][rating] = [];
  }

  all[rating].push({ text });
  byUa[ua][rating].push({ text });
  byDomain[domain][rating].push({ text });
}

function init(_config) {
  config = _config;
}

function finalize() {
  return {
    all,
    byUa,
    byDomain
  };
}

module.exports = {
  init,
  onData,
  finalize
};
