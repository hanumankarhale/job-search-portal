'use strict';

const fs = require('fs');
const path = require('path');

// Tiny JSON-file store. Writes go to a temp file first and are renamed into
// place, so a crash mid-write never leaves a half-written file.
class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) {
    return path.join(this.dir, `${name}.json`);
  }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store] could not read ${name}: ${err.message}`);
      return fallback;
    }
  }

  write(name, value) {
    const target = this.file(name);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, target);
    return value;
  }
}

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  phone: '',
  location: '',
  headline: '',
  yearsExperience: 0,
  summary: '',
  languages: [],
  skills: [],
  targetRoles: [],
  locations: [],
  workMode: 'any',
  excludeKeywords: [],
  highlights: [],
  experience: '',
  education: '',
  linkedin: '',
  github: '',
  portfolio: '',
  minScore: 60,
};

module.exports = { Store, DEFAULT_PROFILE };
