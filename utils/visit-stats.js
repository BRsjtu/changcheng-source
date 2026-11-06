function isValidSiteId(siteIds, record) {
  return Boolean(record && record.siteId && siteIds.has(record.siteId))
}

function mergeRecords(localRecords = [], remoteRecords = []) {
  const seen = new Set()
  return localRecords.concat(remoteRecords).filter((record) => {
    const key = record.clientRecordId || record.id || `${record.kind}:${record.siteId}:${record.createdAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildVisitStats(sites = [], records = [], dateKey) {
  const siteIds = new Set(sites.map((site) => site.id).filter(Boolean))
  const validRecords = records.filter((record) => isValidSiteId(siteIds, record))
  const todayRecords = validRecords.filter((record) => record.date === dateKey)
  const patrolToday = todayRecords.filter((record) => record.kind === 'patrol')
  const checkinToday = todayRecords.filter((record) => record.kind === 'checkin')
  const allCheckins = validRecords.filter((record) => record.kind === 'checkin')

  const patrolTodaySiteIds = new Set(patrolToday.map((record) => record.siteId))
  const allCheckinSiteIds = new Set(allCheckins.map((record) => record.siteId))
  const totalSites = siteIds.size

  return {
    totalSites,
    patrolToday,
    checkinToday,
    patrolTodaySiteIds,
    allCheckinSiteIds,
    patrolSiteCount: patrolTodaySiteIds.size,
    checkinSiteCount: allCheckinSiteIds.size,
    patrolRecordCount: patrolToday.length,
    checkinTodayRecordCount: checkinToday.length,
    patrolProgressPercent: totalSites ? Math.round((patrolTodaySiteIds.size / totalSites) * 100) : 0,
    checkinProgressPercent: totalSites ? Math.round((allCheckinSiteIds.size / totalSites) * 100) : 0,
  }
}

module.exports = {
  buildVisitStats,
  mergeRecords
}
