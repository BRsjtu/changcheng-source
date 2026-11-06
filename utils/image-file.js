function stripDataUrlPrefix(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '')
}

function getMimeTypeFromPath(filePath) {
  const normalizedPath = String(filePath || '').toLowerCase()

  if (normalizedPath.endsWith('.png')) return 'image/png'
  if (normalizedPath.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function isTempPath(filePath) {
  return /^(http:\/\/tmp\/|wxfile:\/\/|file:\/\/|\/tmp\/)/.test(String(filePath || ''))
}

function readRawFileAsBase64(filePath) {
  return new Promise((resolve, reject) => {
    const normalizedPath = String(filePath || '').trim()

    if (!normalizedPath) {
      reject(new Error('图片路径为空'))
      return
    }

    wx.getFileSystemManager().readFile({
      filePath: normalizedPath,
      encoding: 'base64',
      success(result) {
        const imageBase64 = stripDataUrlPrefix(result.data)

        if (!imageBase64 || imageBase64.length < 200) {
          reject(new Error(`图片读取异常，base64 长度过短：${imageBase64.length}`))
          return
        }

        resolve(imageBase64)
      },
      fail(error) {
        reject(new Error(`图片文件读取失败：${(error && error.errMsg) || normalizedPath}`))
      }
    })
  })
}

function saveTempFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!wx.saveFile || !isTempPath(filePath)) {
      reject(new Error('不是可保存的临时文件路径'))
      return
    }

    wx.saveFile({
      tempFilePath: filePath,
      success(result) {
        if (result && result.savedFilePath) {
          resolve(result.savedFilePath)
          return
        }

        reject(new Error('saveFile 未返回 savedFilePath'))
      },
      fail(error) {
        reject(new Error(`saveFile 保存临时图片失败：${(error && error.errMsg) || filePath}`))
      }
    })
  })
}

function getImageInfoPath(src) {
  return new Promise((resolve, reject) => {
    if (!wx.getImageInfo) {
      reject(new Error('当前基础库不支持 getImageInfo'))
      return
    }

    wx.getImageInfo({
      src,
      success(result) {
        if (result && result.path) {
          resolve(result.path)
          return
        }

        reject(new Error('getImageInfo 未返回本地路径'))
      },
      fail(error) {
        reject(new Error(`getImageInfo 转换临时路径失败：${(error && error.errMsg) || src}`))
      }
    })
  })
}

function compressImagePath(src) {
  return new Promise((resolve, reject) => {
    if (!wx.compressImage) {
      reject(new Error('当前基础库不支持 compressImage'))
      return
    }

    wx.compressImage({
      src,
      quality: 85,
      success(result) {
        if (result && result.tempFilePath) {
          resolve(result.tempFilePath)
          return
        }

        reject(new Error('compressImage 未返回 tempFilePath'))
      },
      fail(error) {
        reject(new Error(`compressImage 转换临时图片失败：${(error && error.errMsg) || src}`))
      }
    })
  })
}

async function readFileAsBase64(filePath) {
  const errors = []

  try {
    return await readRawFileAsBase64(filePath)
  } catch (error) {
    errors.push(error.message)
  }

  try {
    const savedPath = await saveTempFile(filePath)
    return await readRawFileAsBase64(savedPath)
  } catch (error) {
    errors.push(error.message)
  }

  let resolvedPath = ''
  try {
    resolvedPath = await getImageInfoPath(filePath)
    return await readRawFileAsBase64(resolvedPath)
  } catch (error) {
    errors.push(error.message)
  }

  try {
    const compressedPath = await compressImagePath(resolvedPath || filePath)
    return await readRawFileAsBase64(compressedPath)
  } catch (error) {
    errors.push(error.message)
  }

  throw new Error(errors.join('；'))
}

async function readImageFile(filePath) {
  let imagePath = String(filePath || '')

  if (isTempPath(imagePath)) {
    try {
      imagePath = await saveTempFile(imagePath)
    } catch (error) {
      // Keep the original temp path; readFileAsBase64 still has conversion fallbacks.
    }
  }

  const imageBase64 = await readFileAsBase64(imagePath)

  return {
    imagePath,
    imageBase64,
    mimeType: getMimeTypeFromPath(imagePath || filePath)
  }
}

async function readImageBase64(candidates) {
  const paths = Array.isArray(candidates) ? candidates.filter(Boolean) : [candidates].filter(Boolean)
  const errors = []

  for (let index = 0; index < paths.length; index += 1) {
    const filePath = paths[index]

    try {
      const result = await readImageFile(filePath)
      return {
        imageBase64: result.imageBase64,
        sourcePath: result.imagePath || filePath,
        mimeType: result.mimeType,
        errors
      }
    } catch (error) {
      errors.push({
        filePath,
        message: error && error.message ? error.message : String(error)
      })
    }
  }

  const detail = errors.map((item) => `${item.filePath}: ${item.message}`).join('；')
  const error = new Error(detail ? `图片读取失败，请重新选择照片。${detail}` : '图片读取失败，请重新选择照片')
  error.details = errors
  throw error
}

module.exports = {
  getMimeTypeFromPath,
  readFileAsBase64,
  readImageBase64,
  readImageFile,
  stripDataUrlPrefix
}
