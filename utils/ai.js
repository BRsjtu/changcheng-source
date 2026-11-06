const { getMimeTypeFromPath, readImageBase64 } = require('./image-file')

function createCancelError() {
  const error = new Error('已取消生成')
  error.code = 'USER_CANCELLED'
  return error
}

function isCancelError(error) {
  return Boolean(error && error.code === 'USER_CANCELLED')
}

function createCancelToken() {
  const tasks = []

  return {
    cancelled: false,
    addTask(task) {
      if (!task || typeof task.abort !== 'function') return
      if (this.cancelled) {
        task.abort()
        return
      }
      tasks.push(task)
    },
    cancel() {
      if (this.cancelled) return
      this.cancelled = true
      tasks.forEach((task) => {
        try {
          task.abort()
        } catch (error) {
          console.warn('abort task failed', error)
        }
      })
    },
    throwIfCancelled() {
      if (this.cancelled) {
        throw createCancelError()
      }
    }
  }
}

function getBaseUrl() {
  const app = getApp()
  return app.globalData.aiBaseUrl
}

function buildNetworkError(url, err) {
  const detail = err && (err.errMsg || err.message)
    ? (err.errMsg || err.message)
    : 'request:fail'
  const hint = detail === 'request:fail'
    ? '。教育版通常不需要配置合法域名；请重新编译并重新扫码预览，确认请求地址已切到开发网关'
    : ''
  return new Error(`AI 网关请求失败：${detail}${hint}。请求地址：${url}`)
}

function rejectIfCancelled(cancelToken, reject) {
  if (cancelToken && cancelToken.cancelled) {
    reject(createCancelError())
    return true
  }
  return false
}

function checkGatewayHealth(cancelToken) {
  const url = `${getBaseUrl()}/health`
  return new Promise((resolve, reject) => {
    if (rejectIfCancelled(cancelToken, reject)) return

    const task = wx.request({
      url,
      method: 'GET',
      timeout: 15000,
      success(res) {
        if (rejectIfCancelled(cancelToken, reject)) return
        if (res.data && res.data.ok) {
          resolve(res.data)
          return
        }
        reject(new Error(`AI 网关健康检查失败：HTTP ${res.statusCode || '未知状态'}`))
      },
      fail(err) {
        if (rejectIfCancelled(cancelToken, reject)) return
        reject(buildNetworkError(url, err))
      }
    })
    if (cancelToken) cancelToken.addTask(task)
  })
}

function request(path, data, cancelToken, options = {}) {
  const url = `${getBaseUrl()}${path}`
  return new Promise((resolve, reject) => {
    if (rejectIfCancelled(cancelToken, reject)) return

    const task = wx.request({
      url,
      method: options.method || 'POST',
      data,
      timeout: options.timeout || 30000,
      success(res) {
        if (rejectIfCancelled(cancelToken, reject)) return
        if (res.data && res.data.ok) {
          resolve(res.data.data)
          return
        }
        const message = res.data && res.data.error
          ? res.data.error
          : `AI 请求失败：HTTP ${res.statusCode || '未知状态'}`
        reject(new Error(message))
      },
      fail(err) {
        if (rejectIfCancelled(cancelToken, reject)) return
        reject(buildNetworkError(url, err))
      }
    })
    if (cancelToken) cancelToken.addTask(task)
  })
}

function sleep(ms, cancelToken) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (cancelToken) {
      const task = {
        abort() {
          clearTimeout(timer)
          reject(createCancelError())
        }
      }
      cancelToken.addTask(task)
    }
  })
}

function isTransientImageError(error) {
  const message = String(error && error.message ? error.message : error || '')
  const status = message.match(/(?:HTTP\s*|status\s*[=:]\s*)(\d{3})/i)
  if (status) return [429, 500, 502, 503, 504, 554].includes(Number(status[1]))
  return /request:fail|network|timeout|timed out|temporarily|interrupted|abort|请求超时/i.test(message)
}

function getCreationErrorMessage(error) {
  const message = String(error && error.message ? error.message : error || '')
  if (/unknown_parameter|Unknown parameter/i.test(message)) {
    const requestId = message.match(/request id:\s*([a-z0-9_-]+)/i)
    return `生图服务暂时异常，请稍后重新生成。${requestId ? `\n错误编号：${requestId[1]}` : ''}`
  }
  return message || 'AI 网关暂时没有返回结果，请稍后重试。'
}

async function requestImageJob(data, cancelToken) {
  const queued = await request('/v1/images/generate', data, cancelToken, { timeout: 30000 })
  const jobId = queued && queued.jobId

  if (!jobId) {
    throw new Error('AI 生图任务没有返回任务编号')
  }

  let transientFailures = 0
  for (let attempt = 0; attempt < 210; attempt += 1) {
    await sleep(2000, cancelToken)
    if (cancelToken) cancelToken.throwIfCancelled()

    let job
    try {
      job = await request(
        `/v1/images/generate/status?jobId=${encodeURIComponent(jobId)}`,
        undefined,
        cancelToken,
        { method: 'GET', timeout: 30000 }
      )
      transientFailures = 0
    } catch (error) {
      if (isCancelError(error) || !isTransientImageError(error)) {
        throw error
      }
      transientFailures += 1
      if (transientFailures >= 4) {
        throw error
      }
      console.warn('image job status interrupted, retrying', {
        jobId,
        transientFailures,
        message: error.message
      })
      continue
    }

    if (job.status === 'complete') {
      return job.data || {}
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'AI 生图失败')
    }
  }

  throw new Error('AI 生图等待超时，请稍后重试')
}

function parseUploadResponse(res, defaultMessage) {
  let payload = null

  try {
    payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } catch (error) {
    throw new Error(`AI 网关上传响应不是合法 JSON：${error.message}`)
  }

  if (payload && payload.ok) {
    return payload.data
  }

  throw new Error(payload && payload.error ? payload.error : `${defaultMessage}：HTTP ${res.statusCode || '未知状态'}`)
}

function uploadReferenceImage({ filePath, cancelToken }) {
  const url = `${getBaseUrl()}/v1/images/upload-reference`

  return new Promise((resolve, reject) => {
    if (rejectIfCancelled(cancelToken, reject)) return

    const task = wx.uploadFile({
      url,
      filePath,
      name: 'image',
      formData: {
        mimeType: getMimeTypeFromPath(filePath)
      },
      timeout: 120000,
      success(res) {
        if (rejectIfCancelled(cancelToken, reject)) return

        try {
          resolve(parseUploadResponse(res, 'AI 参考图上传失败'))
        } catch (error) {
          reject(error)
        }
      },
      fail(err) {
        if (rejectIfCancelled(cancelToken, reject)) return
        reject(buildNetworkError(url, err))
      }
    })
    if (cancelToken) cancelToken.addTask(task)
  })
}

function buildCreationPrompt(site, designType, userText, imageCount) {
  const intro = site
    ? `主题点位：${site.name}。历史线索：${site.story}`
    : '主题：府谷明长城、烽火台、黄土高原与守护行动。'
  const referenceInstruction = imageCount > 1
    ? `用户上传了 ${imageCount} 张参考照片。必须同时参考所有照片：第 1 张作为主要现场/主体结构；第 2 张及之后作为纹理、局部元素、色彩或构图参考，并把这些参考明显融合到最终文创图中。不要只参考第一张。`
    : ''
  return [
    '请生成一张适合微信小程序展示的府谷长城文创设计图。',
    intro,
    `文创类型：${designType}。`,
    referenceInstruction,
    '画面应包含长城墩台、黄土高原肌理、志愿守护者足迹感，风格温暖、清晰、适合学生和志愿者分享。',
    '不要出现真实品牌、二维码、联系方式或误导性官方标识。',
    userText ? `用户补充：${userText}` : '',
    '输出一张完整成品图，画面中可包含“墩台志”三个字。'
  ].filter(Boolean).join('\n')
}

function normalizeImageRefs(imageRefs, imagePaths) {
  if (Array.isArray(imageRefs) && imageRefs.length) {
    return imageRefs
      .map((item) => {
        const candidates = item && Array.isArray(item.candidates)
          ? item.candidates.filter(Boolean)
          : [item && item.path, item && item.originalPath, item && item.uploadPath, item && item.filePath].filter(Boolean)
        return {
          filePath: (item && (item.uploadPath || item.filePath || item.originalPath || item.path)) || candidates[0],
          candidates
        }
      })
      .filter((item) => item.filePath || item.candidates.length)
  }

  const paths = Array.isArray(imagePaths) ? imagePaths.filter(Boolean) : [imagePaths].filter(Boolean)
  return paths.length ? [{ filePath: paths[0], candidates: paths }] : []
}

async function readImageRefsAsPayloads(imageRefs, cancelToken) {
  const images = []

  for (let index = 0; index < imageRefs.length; index += 1) {
    if (cancelToken) cancelToken.throwIfCancelled()
    const read = await readImageBase64(imageRefs[index].candidates)
    if (cancelToken) cancelToken.throwIfCancelled()
    images.push({
      data: read.imageBase64,
      imageBase64: read.imageBase64,
      mimeType: read.mimeType || 'image/jpeg',
      fileName: `reference-${index + 1}.jpg`
    })
  }

  return images
}

async function uploadExtraImageRefs(imageRefs, cancelToken) {
  const uploadIds = []

  for (let index = 0; index < imageRefs.length; index += 1) {
    if (cancelToken) cancelToken.throwIfCancelled()
    const ref = imageRefs[index]
    const result = await uploadReferenceImage({
      filePath: ref.filePath || ref.candidates[0],
      cancelToken
    })
    if (!result || !result.uploadId) throw new Error('参考图上传没有返回图片编号')
    uploadIds.push(result.uploadId)
  }

  return uploadIds
}

async function generateCreation({ site, designType, note, imagePaths, imageRefs, cancelToken }) {
  const app = getApp()
  const aspectRatio = designType === '手机壁纸' ? '9:16' : '1:1'
  const refs = normalizeImageRefs(imageRefs, imagePaths)
  const prompt = buildCreationPrompt(site, designType, note, refs.length)
  const data = {
    model: app.globalData.aiImageModel,
    quality: app.globalData.aiImageQuality || 'medium',
    prompt,
    aspectRatio
  }

  if (refs.length) {
    try {
      data.imageIds = await uploadExtraImageRefs(refs, cancelToken)
    } catch (uploadError) {
      if (isCancelError(uploadError)) throw uploadError
      console.warn('reference image upload failed, fallback to base64 request', uploadError)
      const payloads = await readImageRefsAsPayloads(refs, cancelToken)
      data.images = payloads.map((image) => ({
        mimeType: image.mimeType,
        imageBase64: image.imageBase64
      }))
    }
  }

  if (cancelToken) cancelToken.throwIfCancelled()
  return requestImageJob(data, cancelToken)
}

module.exports = {
  buildCreationPrompt,
  checkGatewayHealth,
  createCancelToken,
  generateCreation,
  getCreationErrorMessage,
  isCancelError,
  request
}
