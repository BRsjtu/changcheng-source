const storage = require('../../utils/storage')
const { getSites } = require('../../data/sites')
const { formatDistance } = require('../../utils/geo')
const { formatTime, localDateKey, recordTitle } = require('../../utils/format')
const { publishGalleryItem } = require('../../utils/gallery')
const { requestSiteActivity } = require('../../utils/site-activity')
const { buildVisitStats, mergeRecords } = require('../../utils/visit-stats')

const SWIPE_DELETE_WIDTH = 86
const SWIPE_OPEN_THRESHOLD = 42

const filters = [
  { key: 'all', label: '全部' },
  { key: 'checkin', label: '打卡' },
  { key: 'patrol', label: '巡检' },
  { key: 'story', label: '记录' }
]

Page({
  data: {
    filters,
    activeFilter: 'all',
    records: [],
    filteredRecords: [],
    todayPatrolSiteCount: 0,
    todayPatrolRecordCount: 0,
    todayCheckinRecordCount: 0,
    todayPatrolPercent: 0,
    totalSites: 0,
    creations: [],
    remoteRecords: []
  },

  onShow() {
    this.refresh()
    this.loadRemoteActivity()
  },

  refresh() {
    const sites = getSites()
    const today = localDateKey()
    const rawRecords = storage.getRecords()
    const stats = buildVisitStats(sites, mergeRecords(rawRecords, this.data.remoteRecords), today)
    const records = rawRecords.map((record) => ({
      ...record,
      title: recordTitle(record),
      roleText: record.role === 'warden' ? '文保员' : '志愿者',
      timeText: formatTime(record.createdAt),
      distanceText: record.distanceMeters ? formatDistance(record.distanceMeters) : '手动确认',
      swipeX: 0
    }))
    this.setData({
      records,
      totalSites: sites.length,
      todayPatrolSiteCount: stats.patrolSiteCount,
      todayPatrolRecordCount: stats.patrolRecordCount,
      todayCheckinRecordCount: stats.checkinTodayRecordCount,
      todayPatrolPercent: stats.patrolProgressPercent,
      creations: storage.getCreations()
    })
    this.applyFilter()
  },

  async loadRemoteActivity() {
    try {
      const result = await requestSiteActivity({ date: localDateKey(), limit: 500 })
      this.setData({ remoteRecords: result.records || [] })
      this.refresh()
    } catch (error) {
      console.warn('load remote activity for history failed', error)
    }
  },

  setFilter(evt) {
    this.setData({
      activeFilter: evt.currentTarget.dataset.key
    })
    this.applyFilter()
  },

  applyFilter() {
    const { activeFilter, records } = this.data
    const filteredRecords = activeFilter === 'all'
      ? records
      : records.filter((record) => record.kind === activeFilter)
    this.setData({ filteredRecords })
  },

  onRecordTouchStart(evt) {
    const touch = evt.touches && evt.touches[0]
    if (!touch) return
    const index = evt.currentTarget.dataset.index
    const current = this.data.filteredRecords[index]
    this.swipeState = {
      index,
      startX: touch.clientX,
      startOffset: current ? (current.swipeX || 0) : 0
    }
  },

  onRecordTouchMove(evt) {
    if (!this.swipeState) return
    const touch = evt.touches && evt.touches[0]
    if (!touch) return
    const delta = touch.clientX - this.swipeState.startX
    const swipeX = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, this.swipeState.startOffset + delta))
    this.setData({
      [`filteredRecords[${this.swipeState.index}].swipeX`]: swipeX
    })
  },

  onRecordTouchEnd() {
    if (!this.swipeState) return
    const index = this.swipeState.index
    const current = this.data.filteredRecords[index]
    const swipeX = current && current.swipeX < -SWIPE_OPEN_THRESHOLD ? -SWIPE_DELETE_WIDTH : 0
    this.setData({
      [`filteredRecords[${index}].swipeX`]: swipeX
    })
    this.swipeState = null
  },

  deleteRecord(evt) {
    const id = evt.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除记录',
      content: '删除后，这条足迹或巡检记录将不再显示。',
      confirmText: '删除',
      confirmColor: '#b42318',
      success: (res) => {
        if (!res.confirm) return
        storage.deleteRecord(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  previewRecordPhoto(evt) {
    const path = evt.currentTarget.dataset.path
    if (!path) return
    const urls = this.data.filteredRecords
      .map((record) => record.photoPath)
      .filter(Boolean)
    wx.previewImage({
      current: path,
      urls
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

  goGallery() {
    wx.navigateTo({ url: '/pages/gallery/gallery' })
  },

  publishRecord(evt) {
    const index = Number(evt.currentTarget.dataset.index)
    const item = this.data.filteredRecords[index]
    if (!item || !item.photoPath) return
    wx.showModal({
      title: '公开到共享空间',
      content: '公开后，其他用户可以在共享空间和对应点位里看到这张照片。',
      confirmText: '公开',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '公开中' })
        try {
          await publishGalleryItem({
            filePath: item.photoPath,
            kind: 'footprint',
            title: item.title,
            siteId: item.siteId,
            siteName: item.siteName,
            typeText: item.title,
            note: item.note || '',
            roleText: item.roleText
          })
          wx.showToast({ title: '已公开', icon: 'success' })
        } catch (error) {
          wx.showModal({
            title: '公开失败',
            content: error.message || '请稍后重试。',
            showCancel: false
          })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  publishCreation(evt) {
    const index = Number(evt.currentTarget.dataset.index)
    const item = this.data.creations[index]
    const filePath = item && (item.localPath || item.savedPath)
    if (!item || !filePath) return
    wx.showModal({
      title: '公开到共享空间',
      content: '公开后，其他用户可以看到这张文创作品，并通过点位找到它的来源。',
      confirmText: '公开',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '公开中' })
        try {
          await publishGalleryItem({
            filePath,
            kind: 'creation',
            title: item.designType || '文创作品',
            siteId: item.siteId,
            siteName: item.siteName,
            typeText: item.designType || '文创作品',
            note: item.note || '',
            roleText: '文创'
          })
          wx.showToast({ title: '已公开', icon: 'success' })
        } catch (error) {
          wx.showModal({
            title: '公开失败',
            content: error.message || '请稍后重试。',
            showCancel: false
          })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
