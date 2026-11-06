function getHeader(headers, key) {
  const target = String(key || '').toLowerCase()
  const source = headers || {}
  const names = Object.keys(source)

  for (let i = 0; i < names.length; i += 1) {
    if (String(names[i]).toLowerCase() === target) {
      return String(source[names[i]] || '')
    }
  }

  return ''
}

function inferImageExtension(imageUrl, contentType) {
  const mime = String(contentType || '').toLowerCase()
  const url = String(imageUrl || '').toLowerCase()

  if (mime.indexOf('png') >= 0 || url.indexOf('.png') >= 0) return 'png'
  if (mime.indexOf('webp') >= 0 || url.indexOf('.webp') >= 0) return 'webp'
  if (mime.indexOf('gif') >= 0 || url.indexOf('.gif') >= 0) return 'gif'
  return 'jpg'
}

function writeImageArrayBufferToLocalFile(imageUrl, arrayBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const fileSystem = wx.getFileSystemManager && wx.getFileSystemManager()
    const userDataPath = wx.env && wx.env.USER_DATA_PATH

    if (!fileSystem || !userDataPath) {
      reject(new Error('当前环境不支持写入本地图片文件'))
      return
    }

    const extension = inferImageExtension(imageUrl, contentType)
    const random = Math.random().toString(16).slice(2, 10)
    const filePath = `${userDataPath}/greatwall-image-${Date.now()}-${random}.${extension}`

    fileSystem.writeFile({
      filePath,
      data: arrayBuffer,
      success() {
        resolve(filePath)
      },
      fail(error) {
        reject(new Error(`写入本地图片失败：${JSON.stringify(error)}`))
      }
    })
  })
}

function createCancelError() {
  const error = new Error('已取消生成')
  error.code = 'USER_CANCELLED'
  return error
}

function rejectIfCancelled(cancelToken, reject) {
  if (cancelToken && cancelToken.cancelled) {
    reject(createCancelError())
    return true
  }
  return false
}

function requestImageToLocalFile(imageUrl, cancelToken) {
  return new Promise((resolve, reject) => {
    if (rejectIfCancelled(cancelToken, reject)) return

    const task = wx.request({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 60000,
      success(res) {
        if (rejectIfCancelled(cancelToken, reject)) return
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.byteLength > 0) {
          writeImageArrayBufferToLocalFile(imageUrl, res.data, getHeader(res.header, 'content-type'))
            .then(resolve)
            .catch(reject)
          return
        }

        reject(new Error(`请求图片字节失败：HTTP ${res.statusCode}`))
      },
      fail(error) {
        if (rejectIfCancelled(cancelToken, reject)) return
        reject(new Error(`请求图片字节失败：${JSON.stringify(error)}`))
      }
    })
    if (cancelToken) cancelToken.addTask(task)
  })
}

function saveTempImageForDisplay(tempFilePath) {
  const filePath = String(tempFilePath || '').trim()

  if (!filePath || !wx.saveFile) {
    return Promise.resolve(filePath)
  }

  return new Promise((resolve) => {
    wx.saveFile({
      tempFilePath: filePath,
      success(res) {
        resolve(res.savedFilePath || filePath)
      },
      fail() {
        resolve(filePath)
      }
    })
  })
}

function downloadImageForDisplay(imageUrl, cancelToken) {
  const url = String(imageUrl || '').trim()

  if (!url || !/^https?:\/\//i.test(url)) {
    return Promise.resolve(url)
  }

  return new Promise((resolve, reject) => {
    if (rejectIfCancelled(cancelToken, reject)) return

    const task = wx.downloadFile({
      url,
      timeout: 60000,
      success(res) {
        if (rejectIfCancelled(cancelToken, reject)) return
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          saveTempImageForDisplay(res.tempFilePath).then(resolve)
          return
        }

        requestImageToLocalFile(url, cancelToken)
          .then(resolve)
          .catch(() => resolve(url))
      },
      fail() {
        if (rejectIfCancelled(cancelToken, reject)) return
        requestImageToLocalFile(url, cancelToken)
          .then(resolve)
          .catch(() => resolve(url))
      }
    })
    if (cancelToken) cancelToken.addTask(task)
  })
}

module.exports = {
  downloadImageForDisplay
}
