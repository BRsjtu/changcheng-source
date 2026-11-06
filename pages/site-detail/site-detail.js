const { getSiteById } = require('../../data/sites')
const storage = require('../../utils/storage')
const { formatTime, localDateKey, recordTitle } = require('../../utils/format')
const { persistSelectedPhoto } = require('../../utils/local-photo')
const { requestGallery } = require('../../utils/gallery')
const { downloadImageForDisplay } = require('../../utils/image-display')
const { buildProtectionScore } = require('../../utils/protection-score')
const { reportSiteActivity } = require('../../utils/site-activity')

Page({
  data: {
    site: null,
    coverImagePath: '',
    note: '',
    photoPath: '',
    photoOriginalPath: '',
    photoPersisted: false,
    records: [],
    publicItems: [],
    protectionScore: null,
    mapMarkers: [],
    mapPoints: [],
    isWarden: false,
    recordSectionTitle: '上传守护记录',
    submitRecordText: '保存记录'
  },

  onLoad(options) {
    const site = getSiteById(options.id)
    this.setData({
      site,
      coverImagePath: site && site.imagePath ? site.imagePath : '',
      mapMarkers: site ? this.buildMapMarkers(site) : [],
      mapPoints: site ? [{ latitude: site.latitude, longitude: site.longitude }] : []
    })
    this.localizeCoverImage(site)
    this.refreshRoleContext()
    this.refreshRecords()
    this.loadPublicItems()
  },

  async localizeCoverImage(site) {
    if (!site || !site.imagePath || !/^https?:\/\//i.test(site.imagePath)) return
    try {
      const localPath = await downloadImageForDisplay(site.imagePath)
      if (localPath && localPath !== site.imagePath && this.data.site && this.data.site.id === site.id) {
        this.setData({ coverImagePath: localPath })
      }
    } catch (error) {
      console.warn('download detail cover failed', site.id, error)
    }
  },

  buildMapMarkers(site) {
    return [{
      id: 1,
      latitude: site.latitude,
      longitude: site.longitude,
      width: 34,
      height: 34,
      iconPath: '/assets/marker-active.png',
      callout: {
        content: site.shortName || site.name,
        color: '#273927',
        fontSize: 13,
        borderRadius: 8,
        bgColor: '#fffdf7',
        padding: 8,
        display: 'ALWAYS'
      }
    }]
  },

  onShow() {
    this.refreshRoleContext()
    this.refreshRecords()
    this.loadPublicItems()
  },

  refreshRoleContext() {
    const isWarden = storage.getRole() === 'warden'
    this.setData({
      isWarden,
      recordSectionTitle: isWarden ? '上传巡检记录' : '上传守护记录',
      submitRecordText: isWarden ? '保存巡检记录' : '保存记录'
    })
  },

  refreshRecords() {
    const site = this.data.site
    if (!site) return
    const records = storage.getRecords()
      .filter((record) => record.siteId === site.id)
      .map((record) => ({
        ...record,
        title: recordTitle(record),
        timeText: formatTime(record.createdAt)
      }))
    this.setData({ records })
    this.refreshProtectionScore()
  },

  async loadPublicItems() {
    const site = this.data.site
    if (!site) return
    try {
      const items = await requestGallery({ limit: 80 })
      this.setData({
        publicItems: items
          .filter((item) => item.siteId === site.id)
          .slice(0, 8)
          .map((item) => ({
              ...item,
              badgeText: item.kind === 'creation' ? '文创' : '实拍'
            }))
      })
      this.refreshProtectionScore()
    } catch (error) {
      console.warn('load public gallery failed', error)
    }
  },

  refreshProtectionScore() {
    const site = this.data.site
    if (!site) return
    this.setData({
      protectionScore: buildProtectionScore(site, storage.getRecords(), this.data.publicItems)
    })
  },

  onNoteInput(evt) {
    this.setData({ note: evt.detail.value })
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        const originalPath = file ? (file.tempFilePath || file.path || '') : ''
        const photo = await persistSelectedPhoto(originalPath)
        this.setData({
          photoPath: photo.path,
          photoOriginalPath: photo.originalPath,
          photoPersisted: photo.persisted
        })
        if (photo.path && !photo.persisted) {
          wx.showToast({ title: '照片已选，可能无法长期保留', icon: 'none' })
        }
      }
    })
  },

  previewPickedPhoto() {
    if (!this.data.photoPath) return
    wx.previewImage({
      current: this.data.photoPath,
      urls: [this.data.photoPath]
    })
  },

  previewRecordPhoto(evt) {
    const path = evt.currentTarget.dataset.path
    if (!path) return
    wx.previewImage({
      current: path,
      urls: this.data.records.map((record) => record.photoPath).filter(Boolean)
    })
  },

  previewPublicPhoto(evt) {
    const index = Number(evt.currentTarget.dataset.index)
    const item = this.data.publicItems[index]
    if (!item) return
    wx.previewImage({
      current: item.imageUrl,
      urls: this.data.publicItems.map((entry) => entry.imageUrl).filter(Boolean)
    })
  },

  openLocation() {
    const site = this.data.site
    if (!site) return
    wx.openLocation({
      latitude: site.latitude,
      longitude: site.longitude,
      name: site.name,
      address: site.coverText || site.typeName,
      scale: 15
    })
  },

  goFootprint() {
    const site = this.data.site
    if (!site) return
    storage.setFocusSite(site.id)
    wx.switchTab({ url: '/pages/footprint/footprint' })
  },

  saveStory() {
    const site = this.data.site
    const note = this.data.note.trim()
    if (!note && !this.data.photoPath) {
      wx.showToast({ title: '先写记录或选照片', icon: 'none' })
      return
    }
    const role = storage.getRole()
    const kind = role === 'warden' ? 'patrol' : 'story'
    const record = {
      id: `${kind === 'patrol' ? 'r' : 's'}_${Date.now()}`,
      siteId: site.id,
      siteName: site.name,
      kind,
      role,
      note,
      photoPath: this.data.photoPath,
      photoOriginalPath: this.data.photoOriginalPath,
      photoPersisted: this.data.photoPersisted,
      createdAt: Date.now(),
      date: localDateKey(),
      distanceMeters: 0,
      inRange: false,
      location: null
    }
    storage.addRecord(record)
    if (kind === 'patrol') {
      reportSiteActivity(record).catch((error) => {
        console.warn('sync detail patrol failed', error)
        wx.showToast({ title: '已保存，稍后同步', icon: 'none' })
      })
    }
    this.setData({
      note: '',
      photoPath: '',
      photoOriginalPath: '',
      photoPersisted: false
    })
    wx.showToast({ title: kind === 'patrol' ? '巡检已记录' : '已保存', icon: 'success' })
    this.refreshRecords()
  }
})
