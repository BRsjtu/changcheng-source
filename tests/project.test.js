const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { getSites } = require('../data/sites')
const { distanceMeters } = require('../utils/geo')
const { buildCreationPrompt } = require('../utils/ai')

test('ships a usable site catalog', () => {
  const sites = getSites()
  assert.ok(sites.length >= 10)
  assert.ok(sites.some((site) => site.type === 'beacon'))
  assert.ok(sites.some((site) => site.type === 'fort'))
  assert.ok(sites.some((site) => site.type === 'viewpoint'))
  for (const site of sites) {
    assert.ok(site.id)
    assert.ok(site.name)
    assert.equal(typeof site.latitude, 'number')
    assert.equal(typeof site.longitude, 'number')
    assert.ok(site.story.length > 20)
  }
})

test('distance calculation is realistic', () => {
  const meters = distanceMeters(
    { latitude: 39.0469, longitude: 111.1242 },
    { latitude: 39.0469, longitude: 111.1242 }
  )
  assert.equal(meters, 0)
  const far = distanceMeters(
    { latitude: 39.0469, longitude: 111.1242 },
    { latitude: 39.1266, longitude: 111.0837 }
  )
  assert.ok(far > 8000)
})

test('creation prompt keeps the cultural brief', () => {
  const site = getSites()[0]
  const prompt = buildCreationPrompt(site, '明信片', '国潮但不要夸张')
  assert.match(prompt, /府谷长城/)
  assert.match(prompt, /明信片/)
  assert.match(prompt, /墩台志/)
  assert.match(prompt, /不要出现真实品牌/)
})

test('workshop image generation uses asynchronous jobs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'ai.js'), 'utf8')
  assert.match(source, /\/v1\/images\/generate/)
  assert.match(source, /\/v1\/images\/generate\/status/)
  assert.doesNotMatch(source, /request\('\/v1\/images\/edit'/)
})

test('detail records become synced patrols for wardens', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'site-detail', 'site-detail.js'), 'utf8')
  assert.match(source, /role === 'warden' \? 'patrol' : 'story'/)
  assert.match(source, /reportSiteActivity\(record\)/)
})

test('map markers open details without forcing a new map center', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'footprint', 'footprint.js'), 'utf8')
  const markerHandler = source.slice(source.indexOf('openMarkerDetail('), source.indexOf('onMarkerTap('))
  assert.match(markerHandler, /wx\.navigateTo/)
  assert.match(markerHandler, /pages\/site-detail\/site-detail\?id=/)
  assert.doesNotMatch(markerHandler, /center\s*:/)
})
