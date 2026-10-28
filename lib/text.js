'use strict';

// Job postings are third-party text. Everything here turns them into plain,
// inert text and surfaces signs of tampering; nothing from a posting is ever
// rendered as HTML or followed as an instruction.

const ZERO_WIDTH = /[​-‍⁠-⁤﻿­]/g;
const BIDI_TAMPER = /[‪-‮⁦-⁩]/g;
const TAG_CHARS = /[\u{E0000}-\u{E007F}]/gu;

const INSTRUCTION_SHAPED = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i,
  /\b(you are|act as) (an? )?(ai|assistant|language model|llm|chatgpt|claude)\b/i,
  /\b(if you are|attention) (an? )?(ai|llm|language model|bot|assistant)\b/i,
  /\bsystem prompt\b/i,
  /\bdisregard (the|all|your) (rules|instructions)\b/i,
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Convert posting HTML to readable plain text. Hidden elements are dropped
// rather than shown, since their only purpose in a posting is to be read by a
// machine and not a person.
function htmlToText(input) {
  if (!input) return '';
  let s = String(input);
  // Some APIs double-encode their HTML.
  if (/&lt;\/?[a-z]/i.test(s) && !/<[a-z]/i.test(s)) s = decodeEntities(s);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<([a-z0-9]+)\b[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|\shidden\b|aria-hidden\s*=\s*["']?true)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article)>/gi, '\n');
  s = s.replace(/<(p|div|h[1-6]|ul|ol|tr|section|article)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r/g, '').replace(/[ \t\f\v]+/g, ' ');
  s = s.split('\n').map((l) => l.trim()).join('\n');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Strip invisible characters and report what looked suspicious.
function guardPosting(text) {
  const flags = [];
  const s = String(text || '');
  const zw = (s.match(ZERO_WIDTH) || []).length;
  const bidi = (s.match(BIDI_TAMPER) || []).length;
  const tags = (s.match(TAG_CHARS) || []).length;
  if (bidi) flags.push(`${bidi} bidi override character(s) removed`);
  if (tags) flags.push(`${tags} invisible Unicode tag character(s) removed`);
  if (zw > 5) flags.push(`${zw} zero-width character(s) removed`);
  const clean = s.replace(ZERO_WIDTH, '').replace(BIDI_TAMPER, '').replace(TAG_CHARS, '');
  for (const line of clean.split('\n')) {
    if (INSTRUCTION_SHAPED.some((re) => re.test(line))) {
      flags.push(`Instruction-shaped line: "${line.slice(0, 120)}"`);
    }
  }
  return { text: clean, flags };
}

function extractEmails(text) {
  const found = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(found.map((e) => e.replace(/\.$/, '').toLowerCase()))]
    .filter((e) => !/^(no-?reply|donotreply)@/.test(e))
    .slice(0, 3);
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

module.exports = { htmlToText, decodeEntities, guardPosting, extractEmails, truncate };
