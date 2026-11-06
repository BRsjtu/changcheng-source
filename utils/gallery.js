function getBaseUrl() {
  return getApp().globalData.aiBaseUrl
}

function requestGallery(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
  const url = `${getBaseUrl()}/v1/gallery${query ? `?${query}` : ''}`

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 30000,
      success(res) {
        if (res.data && res.data.ok) {
          resolve(res.data.data || [])
          return
        }
        reject(new Error(res.data && res.data.error ? res.data.error : `共享空间读取失败：HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(`共享空间请求失败：${err.errMsg || err.message || 'request:fail'}`))
      }
    })
  })
}

function publishGalleryItem({ filePath, kind, title, siteId, siteName, typeText, note, roleText, mimeType }) {
  if (!filePath) {
    return Promise.reject(new Error('缺少要公开的图片。'))
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getBaseUrl()}/v1/gallery/publish`,
      filePath,
      name: 'image',
      timeout: 120000,
      formData: {
        kind: kind || 'footprint',
        title: title || '',
        siteId: siteId || '',
        siteName: siteName || '',
        typeText: typeText || '',
        note: note || '',
        roleText: roleText || '',
        mimeType: mimeType || 'image/jpeg'
      },
      success(res) {
        let payload = null
        try {
          payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch (error) {
          reject(new Error(`共享空间响应异常：${error.message}`))
          return
        }

        if (payload && payload.ok) {
          resolve(payload.data)
          return
        }
        reject(new Error(payload && payload.error ? payload.error : `公开失败：HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(`公开上传失败：${err.errMsg || err.message || 'uploadFile:fail'}`))
      }
    })
  })
}

module.exports = {
  publishGalleryItem,
  requestGallery
}
