function persistSelectedPhoto(originalPath) {
  const sourcePath = String(originalPath || '').trim()

  if (!sourcePath) {
    return Promise.resolve({
      path: '',
      originalPath: '',
      persisted: false
    })
  }

  if (!wx.saveFile) {
    return Promise.resolve({
      path: sourcePath,
      originalPath: sourcePath,
      persisted: false
    })
  }

  return new Promise((resolve) => {
    wx.saveFile({
      tempFilePath: sourcePath,
      success(res) {
        resolve({
          path: res.savedFilePath || sourcePath,
          originalPath: sourcePath,
          persisted: Boolean(res.savedFilePath)
        })
      },
      fail(error) {
        console.warn('save local record photo failed', error)
        resolve({
          path: sourcePath,
          originalPath: sourcePath,
          persisted: false
        })
      }
    })
  })
}

module.exports = {
  persistSelectedPhoto
}
