const RECORD_KEY = 'guardian_records_v1'
const WORK_KEY = 'guardian_creations_v1'
const ROLE_KEY = 'guardian_role_v1'
const FOCUS_SITE_KEY = 'guardian_focus_site_v1'

function readList(key) {
  try {
    const value = wx.getStorageSync(key)
    return Array.isArray(value) ? value : []
  } catch (err) {
    console.warn('read storage failed', key, err)
    return []
  }
}

function writeList(key, list, maxLength) {
  const next = list.slice(0, maxLength)
  wx.setStorageSync(key, next)
  return next
}

function getRecords() {
  return readList(RECORD_KEY)
}

function addRecord(record) {
  const records = getRecords()
  return writeList(RECORD_KEY, [record, ...records], 60)
}

function deleteRecord(id) {
  const records = getRecords().filter((record) => record.id !== id)
  return writeList(RECORD_KEY, records, 60)
}

function migrateWardenStoriesToPatrol() {
  const records = getRecords()
  const migrated = []
  const next = records.map((record) => {
    if (!record || record.kind !== 'story' || record.role !== 'warden') {
      return record
    }
    const patrol = {
      ...record,
      kind: 'patrol',
      distanceMeters: Number(record.distanceMeters) || 0,
      inRange: Boolean(record.inRange),
      migratedFrom: 'story'
    }
    migrated.push(patrol)
    return patrol
  })

  if (migrated.length) {
    writeList(RECORD_KEY, next, 60)
  }
  return migrated
}

function getCreations() {
  return readList(WORK_KEY)
}

function addCreation(item) {
  const list = getCreations()
  return writeList(WORK_KEY, [item, ...list], 30)
}

function getRole() {
  try {
    return wx.getStorageSync(ROLE_KEY) || 'volunteer'
  } catch (err) {
    return 'volunteer'
  }
}

function setRole(role) {
  wx.setStorageSync(ROLE_KEY, role)
}

function setFocusSite(siteId) {
  wx.setStorageSync(FOCUS_SITE_KEY, siteId)
}

function consumeFocusSite() {
  try {
    const siteId = wx.getStorageSync(FOCUS_SITE_KEY)
    if (siteId) {
      wx.removeStorageSync(FOCUS_SITE_KEY)
    }
    return siteId || ''
  } catch (err) {
    return ''
  }
}

module.exports = {
  addCreation,
  addRecord,
  consumeFocusSite,
  deleteRecord,
  getCreations,
  getRecords,
  getRole,
  migrateWardenStoriesToPatrol,
  setFocusSite,
  setRole
}
