const { getSites, getSiteById } = require('../../data/sites')
const { checkGatewayHealth, createCancelToken, generateCreation, getCreationErrorMessage, isCancelError } = require('../../utils/ai')
const { downloadImageForDisplay } = require('../../utils/image-display')
const storage = require('../../utils/storage')

const designTypes = ['冰箱贴', '书签', '明信片', '帆布包图案', '手机壁纸']
const maxPhotoCount = 4
const generationEstimateSeconds = 70
const progressMascots = [
  '/assets/cartoon/cartoon2.png',
  '/assets/cartoon/cartoon5.png',
  '/assets/cartoon/cartoon6.png',
  '/assets/cartoon/cartoon7.png'
]

function mascotProgress(progress) {
  return Math.max(8, Math.min(92, progress))
}

function makePhotoId() {
  return `p_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function savePhotoForPreview(originalPath) {
  return new Promise((resolve) => {
    if (!originalPath || !wx.saveFile) {
      resolve(originalPath)
      return
    }

    wx.saveFile({
      tempFilePath: originalPath,
      success(saved) {
        resolve(saved.savedFilePath || originalPath)
      },
      fail() {
        resolve(originalPath)
      }
    })
  })
}

function writeBase64Image(base64, mimeType) {
  return new Promise((resolve, reject) => {
    const ext = mimeType && (mimeType.indexOf('jpeg') >= 0 || mimeType.indexOf('jpg') >= 0) ? 'jpg' : 'png'
    const filePath = `${wx.env.USER_DATA_PATH}/greatwall_${Date.now()}.${ext}`
    wx.getFileSystemManager().writeFile({
      filePath,
      data: base64,
      encoding: 'base64',
      success: () => {
        wx.getImageInfo({
          src: filePath,
          success(info) {
            console.log('generated image ready', {
              filePath,
              previewPath: info.path,
              width: info.width,
              height: info.height,
              mimeType
            })
            resolve({
              localPath: info.path || filePath,
              savedPath: filePath,
              width: info.width,
              height: info.height
            })
          },
          fail(err) {
            console.warn('generated image validation failed', filePath, err)
            reject(new Error(`生成图保存成功但读取失败：${err.errMsg || err.message || '未知错误'}`))
          }
        })
      },
      fail: reject
    })
  })
}

Page({
  data: {
    sites: [],
    selectedSiteId: '',
    selectedSiteName: '',
    designTypes,
    designType: designTypes[0],
    note: '',
    photos: [],
    photoPath: '',
    photoOriginalPath: '',
    photoUploadPath: '',
    generating: false,
    canceling: false,
    generationProgress: 0,
    generationMascotProgress: 8,
    generationMascot: progressMascots[0],
    generationProgressText: '预计需要 50-70 秒，请保持页面打开',
    currentImage: '',
    currentRemote: '',
    creations: []
  },

  onLoad() {
    const sites = getSites()
    this.setData({
      sites,
      selectedSiteId: sites[0] ? sites[0].id : '',
      selectedSiteName: sites[0] ? sites[0].name : ''
    })
    this.refreshCreations()
  },

  onShow() {
    this.refreshCreations()
  },

  refreshCreations() {
    this.setData({
      creations: storage.getCreations().slice(0, 6)
    })
  },

  selectSite(evt) {
    const selectedSiteId = evt.currentTarget.dataset.id
    const site = this.data.sites.find((item) => item.id === selectedSiteId)
    if (!site) return
    this.setData({
      selectedSiteId,
      selectedSiteName: site.name
    })
  },

  selectType(evt) {
    this.setData({ designType: evt.currentTarget.dataset.type })
  },

  onNoteInput(evt) {
    this.setData({ note: evt.detail.value })
  },

  syncPhotos(photos) {
    const first = photos[0] || {}
    this.setData({
      photos,
      photoPath: first.path || '',
      photoOriginalPath: first.originalPath || '',
      photoUploadPath: first.uploadPath || ''
    })
  },

  choosePhoto() {
    if (this.data.generating) return
    const remain = maxPhotoCount - this.data.photos.length
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${maxPhotoCount} 张`, icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        const nextPhotos = []

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          const originalPath = file ? (file.tempFilePath || file.path || '') : ''
          if (!originalPath) {
            continue
          }

          const savedPath = await savePhotoForPreview(originalPath)
          nextPhotos.push({
            id: makePhotoId(),
            path: savedPath || originalPath,
            originalPath,
            uploadPath: originalPath
          })
        }

        if (!nextPhotos.length) {
          return
        }

        this.syncPhotos(this.data.photos.concat(nextPhotos).slice(0, maxPhotoCount))
      }
    })
  },

  removePhoto(evt) {
    if (this.data.generating) return
    const id = evt.currentTarget.dataset.id
    this.syncPhotos(this.data.photos.filter((item) => item.id !== id))
  },

  previewPhoto(evt) {
    const index = Number(evt.currentTarget.dataset.index || 0)
    const urls = this.data.photos.map((item) => item.path).filter(Boolean)
    if (!urls.length) return
    wx.previewImage({
      current: urls[index] || urls[0],
      urls
    })
  },

  cancelGenerate() {
    if (!this.data.generating || !this.cancelToken) return
    this.setData({ canceling: true })
    this.cancelToken.cancel()
  },

  startProgress() {
    this.stopProgress()
    const startedAt = Date.now()
    this.setData({
      generationProgress: 6,
      generationMascotProgress: mascotProgress(6),
      generationMascot: progressMascots[0],
      generationProgressText: '正在连接 AI 网关，预计需要 50-70 秒'
    })
    this.progressTimer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const ratio = Math.min(elapsed / generationEstimateSeconds, 1)
      const progress = Math.min(92, Math.round(6 + ratio * 86))
      const mascotIndex = Math.floor(elapsed / 5) % progressMascots.length
      const remaining = Math.max(0, Math.ceil(generationEstimateSeconds - elapsed))
      const text = progress < 30
        ? '正在整理照片和点位信息'
        : progress < 70
          ? `AI 正在绘制，预计还需 ${remaining} 秒左右`
          : '图片快好了，正在等待最后结果'
      this.setData({
        generationProgress: progress,
        generationMascotProgress: mascotProgress(progress),
        generationMascot: progressMascots[mascotIndex],
        generationProgressText: text
      })
    }, 1000)
  },

  stopProgress() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  },

  async generate() {
    if (this.data.generating) return
    const site = getSiteById(this.data.selectedSiteId)
    if (!site) return
    const cancelToken = createCancelToken()
    this.cancelToken = cancelToken
    this.setData({ generating: true, canceling: false })
    this.startProgress()
    wx.showNavigationBarLoading()
    try {
      await checkGatewayHealth(cancelToken)
      const result = await generateCreation({
        site,
        designType: this.data.designType,
        note: this.data.note.trim(),
        imageRefs: this.data.photos.map((photo) => ({
          filePath: photo.uploadPath || photo.originalPath || photo.path,
          candidates: [photo.path, photo.originalPath, photo.uploadPath].filter(Boolean)
        })),
        cancelToken
      })
      const base64 = result.imageBase64 || (result.images && result.images[0] && result.images[0].imageBase64)
      const imageUrl = result.imageUrl || ''
      if (!base64 && !imageUrl) {
        throw new Error('AI 没有返回图片')
      }
      const imageFile = imageUrl
        ? {
            localPath: await downloadImageForDisplay(imageUrl, cancelToken),
            savedPath: imageUrl
          }
        : await writeBase64Image(base64, result.mimeType || 'image/png')
      const creation = {
        id: `c_${Date.now()}`,
        siteId: site.id,
        siteName: site.name,
        designType: this.data.designType,
        note: this.data.note.trim(),
        localPath: imageFile.localPath,
        savedPath: imageFile.savedPath,
        imageId: result.imageId || '',
        imageUrl,
        createdAt: Date.now()
      }
      storage.addCreation(creation)
      this.setData({
        currentImage: imageFile.localPath,
        currentRemote: imageUrl,
        generationProgress: 100,
        generationMascotProgress: mascotProgress(100),
        generationProgressText: '生成完成'
      })
      this.refreshCreations()
      wx.showToast({ title: '已生成', icon: 'success' })
    } catch (err) {
      if (isCancelError(err)) {
        wx.showToast({ title: '已取消', icon: 'none' })
        return
      }
      console.error('generate creation failed', err)
      wx.showModal({
        title: '生成失败',
        content: getCreationErrorMessage(err),
        showCancel: false
      })
    } finally {
      this.stopProgress()
      if (this.cancelToken === cancelToken) {
        this.cancelToken = null
        this.setData({
          generating: false,
          canceling: false,
          generationProgress: 0,
          generationMascotProgress: 8,
          generationProgressText: '预计需要 50-70 秒，请保持页面打开'
        })
      }
      wx.hideNavigationBarLoading()
    }
  },

  previewCurrent() {
    if (!this.data.currentImage) return
    wx.previewImage({
      current: this.data.currentImage,
      urls: [this.data.currentImage]
    })
  },

  previewCreation(evt) {
    const item = this.data.creations[evt.currentTarget.dataset.index]
    if (!item) return
    const urls = this.data.creations
      .map((creation) => creation.localPath || creation.savedPath || creation.imageUrl)
      .filter(Boolean)
    wx.previewImage({
      current: item.localPath || item.savedPath || item.imageUrl,
      urls
    })
  },

  saveCurrent() {
    if (!this.data.currentImage) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.currentImage,
      success: () => wx.showToast({ title: '已保存', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  }
})
