function getBaseUrl() {
  return getApp().globalData.aiBaseUrl
}

function requestSiteActivity({ date, limit = 300 } = {}) {
  const params = []
  if (date) params.push(`date=${encodeURIComponent(date)}`)
  if (limit) params.push(`limit=${encodeURIComponent(limit)}`)
  const query = params.length ? `?${params.join('&')}` : ''

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}/v1/site-activity${query}`,
      method: 'GET',
      timeout: 30000,
      success(res) {
        if (res.data && res.data.ok) {
          resolve(res.data.data || { records: [], summary: {} })
          return
        }
        reject(new Error(res.data && res.data.error ? res.data.error : `巡检同步读取失败：HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(`巡检同步读取失败：${err.errMsg || err.message || 'request:fail'}`))
      }
    })
  })
}

function reportSiteActivity(record) {
  if (!record || !record.siteId || !record.kind) {
    return Promise.reject(new Error('缺少要同步的巡检或打卡记录。'))
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}/v1/site-activity/report`,
      method: 'POST',
      timeout: 30000,
      data: {
        clientRecordId: record.id,
        siteId: record.siteId,
        siteName: record.siteName,
        kind: record.kind,
        role: record.role,
        date: record.date,
        createdAt: record.createdAt,
        distanceMeters: record.distanceMeters,
        inRange: record.inRange,
        hasPhoto: Boolean(record.photoPath)
      },
      success(res) {
        if (res.data && res.data.ok) {
          resolve(res.data.data)
          return
        }
        reject(new Error(res.data && res.data.error ? res.data.error : `巡检同步失败：HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(`巡检同步失败：${err.errMsg || err.message || 'request:fail'}`))
      }
    })
  })
}

module.exports = {
  reportSiteActivity,
  requestSiteActivity
}
