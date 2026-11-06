const assert = require('node:assert/strict')
const test = require('node:test')

const { buildVisitStats, mergeRecords } = require('../utils/visit-stats')

const sites = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' }
]

test('one patrol record covers only one site', () => {
  const stats = buildVisitStats(sites, [
    { id: 'r1', kind: 'patrol', siteId: 'a', date: '2026-06-28', createdAt: 1 }
  ], '2026-06-28')

  assert.equal(stats.totalSites, 5)
  assert.equal(stats.patrolSiteCount, 1)
  assert.equal(stats.patrolRecordCount, 1)
  assert.equal(stats.patrolProgressPercent, 20)
  assert.deepEqual(Array.from(stats.patrolTodaySiteIds), ['a'])
})

test('repeated patrols increase count but not covered sites', () => {
  const stats = buildVisitStats(sites, [
    { id: 'r1', kind: 'patrol', siteId: 'a', date: '2026-06-28', createdAt: 1 },
    { id: 'r2', kind: 'patrol', siteId: 'a', date: '2026-06-28', createdAt: 2 }
  ], '2026-06-28')

  assert.equal(stats.patrolSiteCount, 1)
  assert.equal(stats.patrolRecordCount, 2)
  assert.equal(stats.patrolProgressPercent, 20)
})

test('invalid site records do not inflate patrol progress', () => {
  const stats = buildVisitStats(sites, [
    { id: 'bad', kind: 'patrol', siteId: 'all', date: '2026-06-28', createdAt: 1 },
    { id: 'ok', kind: 'patrol', siteId: 'b', date: '2026-06-28', createdAt: 2 }
  ], '2026-06-28')

  assert.equal(stats.patrolSiteCount, 1)
  assert.equal(stats.patrolRecordCount, 1)
})

test('mergeRecords removes local and remote duplicates by client id', () => {
  const merged = mergeRecords(
    [{ id: 'r1', kind: 'patrol', siteId: 'a', createdAt: 1 }],
    [{ clientRecordId: 'r1', kind: 'patrol', siteId: 'a', createdAt: 1 }]
  )

  assert.equal(merged.length, 1)
})

test('legacy warden stories migrate to patrol records once', () => {
  const values = {
    guardian_records_v1: [
      { id: 'old-warden', kind: 'story', role: 'warden', siteId: 'a', date: '2026-08-25' },
      { id: 'volunteer-story', kind: 'story', role: 'volunteer', siteId: 'b', date: '2026-08-25' }
    ]
  }
  global.wx = {
    getStorageSync(key) {
      return values[key]
    },
    setStorageSync(key, value) {
      values[key] = value
    }
  }

  const storagePath = require.resolve('../utils/storage')
  delete require.cache[storagePath]
  const storage = require('../utils/storage')
  const migrated = storage.migrateWardenStoriesToPatrol()

  assert.equal(migrated.length, 1)
  assert.equal(migrated[0].id, 'old-warden')
  assert.equal(values.guardian_records_v1[0].kind, 'patrol')
  assert.equal(values.guardian_records_v1[1].kind, 'story')
  assert.equal(storage.migrateWardenStoriesToPatrol().length, 0)
  delete global.wx
})
