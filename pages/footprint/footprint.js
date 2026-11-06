const { getSites } = require('../../data/sites')
const { distanceMeters, formatDistance } = require('../../utils/geo')
const storage = require('../../utils/storage')
const { formatTime, localDateKey, recordTitle } = require('../../utils/format')
const { persistSelectedPhoto } = require('../../utils/local-photo')
const { reportSiteActivity, requestSiteActivity } = require('../../utils/site-activity')
const { buildVisitStats, mergeRecords } = require('../../utils/visit-stats')

const SWIPE_DELETE_WIDTH = 86
const SWIPE_OPEN_THRESHOLD = 42

const roleMap = {
  volunteer: '学生 / 志愿者',
  warden: '文保员'
}

Page({
  data: {
    center: getApp().globalData.mapCenter,
    sites: [],
    markers: [],
    selected: null,
    role: 'volunteer',
    roleText: roleMap.volunteer,
    checkedCount: 0,
    progressPercent: 0,
    statOneLabel: '已点亮',
    statTwoLabel: '进度',
    statThreeValue: 0,
    statThreeLabel: '今日打卡',
    recentRecords: [],
    recentTitle: '最近足迹',
    emptyText: '选择地图上的点位，开始记录第一步。',
    modeHelp: '志愿者模式会累计点亮已打卡点位。',
    selectedStatusText: '未点亮',
    primaryActionText: '到此打卡',
    locationText: '点击打卡时会读取当前位置，也可以手动确认记录。',
    visitPhotoPath: '',
    visitPhotoOriginalPath: '',
    visitPhotoPersisted: false,
    remoteRecords: []
  },

  onLoad() {
    const sites = getSites()
    const role = storage.getRole()
    this.setData({
      sites,
      role,
      roleText: roleMap[role],
      selected: sites[0]
    })
    this.migrateLegacyPatrols()
    this.refresh()
  },

  migrateLegacyPatrols() {
    const migrated = storage.migrateWardenStoriesToPatrol()
    migrated.forEach((record) => {
      reportSiteActivity(record).catch((error) => {
        console.warn('sync migrated patrol failed', record.id, error)
      })
    })
  },

  onShow() {
    this.refresh()
    this.loadRemoteActivity()
    const focusSiteId = storage.consumeFocusSite()
    if (focusSiteId) {
      this.focusSite(focusSiteId)
    }
  },

  refresh() {
    const localRecords = storage.getRecords()
    const records = mergeRecords(localRecords, this.data.remoteRecords)
    const role = this.data.role
    const today = localDateKey()
    const stats = buildVisitStats(this.data.sites, records, today)
    const checkedIds = role === 'warden'
      ? stats.patrolTodaySiteIds
      : stats.allCheckinSiteIds
    const checkedCount = checkedIds.size
    const progressPercent = role === 'warden' ? stats.patrolProgressPercent : stats.checkinProgressPercent
    const sites = this.data.sites.map((site) => ({ ...site, checked: checkedIds.has(site.id) }))
    const selected = sites.find((site) => site.id === (this.data.selected && this.data.selected.id)) || sites[0]
    const recentSource = role === 'warden'
      ? localRecords.filter((r) => r.kind === 'patrol')
      : localRecords.filter((r) => r.kind !== 'patrol')
    this.setData({
      sites,
      selected,
      checkedCount,
      progressPercent,
      statOneLabel: role === 'warden' ? '今日已巡' : '已点亮',
      statTwoLabel: role === 'warden' ? '巡逻进度' : '进度',
      statThreeValue: role === 'warden' ? stats.patrolRecordCount : stats.checkinTodayRecordCount,
      statThreeLabel: role === 'warden' ? '巡检次数' : '今日打卡',
      recentTitle: role === 'warden' ? '巡逻历史' : '最近足迹',
      emptyText: role === 'warden' ? '切到文保员身份后，选择点位开始今日巡检。' : '选择地图上的点位，开始记录第一步。',
      modeHelp: role === 'warden'
        ? `今日 ${today} 全体已巡 ${checkedCount}/${stats.totalSites} 个点位，共 ${stats.patrolRecordCount} 次巡检，待巡 ${Math.max(stats.totalSites - checkedCount, 0)} 个点位。`
        : '志愿者模式会累计点亮已打卡点位。',
      selectedStatusText: role === 'warden'
        ? (selected && selected.checked ? '今日已巡' : '今日未巡')
        : (selected && selected.checked ? '已点亮' : '未点亮'),
      primaryActionText: role === 'warden'
        ? (selected && selected.checked ? '补记复查' : '记录巡检')
        : '到此打卡',
      recentRecords: recentSource.slice(0, 5).map(this.decorateRecord),
      markers: this.buildMarkers(sites, selected && selected.id)
    })
  },

  async loadRemoteActivity() {
    try {
      const result = await requestSiteActivity({ date: localDateKey(), limit: 500 })
      this.setData({
        remoteRecords: result.records || []
      })
      this.refresh()
    } catch (error) {
      console.warn('load remote activity failed', error)
    }
  },

  buildMarkers(sites, selectedId) {
    return sites.map((site, index) => ({
      id: index + 1,
      siteId: site.id,
      latitude: site.latitude,
      longitude: site.longitude,
      width: site.id === selectedId ? 42 : 34,
      height: site.id === selectedId ? 42 : 34,
      iconPath: site.checked ? '/assets/marker-active.png' : '/assets/marker.png',
      callout: {
        content: site.shortName,
        color: site.id === selectedId || site.checked ? '#1f6d3d' : '#273927',
        fontSize: 13,
        borderRadius: 8,
        bgColor: '#fffdf7',
        padding: 8,
        display: 'ALWAYS',
        borderColor: site.id === selectedId ? '#1f6d3d' : '#ece8da',
        borderWidth: site.id === selectedId ? 1 : 0
      },
      label: {
        content: site.checked ? '✓' : '',
        color: '#ffffff',
        fontSize: 12,
        anchorX: -4,
        anchorY: -4
      }
    }))
  },

  focusSite(siteId) {
    const selected = this.data.sites.find((site) => site.id === siteId)
    if (!selected) return
    this.setData({
      selected,
      center: {
        latitude: selected.latitude,
        longitude: selected.longitude
      },
      markers: this.buildMarkers(this.data.sites, selected.id),
      locationText: this.data.role === 'warden'
        ? '文保员巡检会记录今天的时间、点位和定位距离。'
        : '点击打卡时会读取当前位置，也可以手动确认记录。'
    })
  },

  decorateRecord(record) {
    return {
      ...record,
      title: recordTitle(record),
      roleText: record.role === 'warden' ? '文保员' : '志愿者',
      timeText: formatTime(record.createdAt),
      swipeX: 0
    }
  },

  onRecordTouchStart(evt) {
    const touch = evt.touches && evt.touches[0]
    if (!touch) return
    const index = evt.currentTarget.dataset.index
    const current = this.data.recentRecords[index]
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
      [`recentRecords[${this.swipeState.index}].swipeX`]: swipeX
    })
  },

  onRecordTouchEnd() {
    if (!this.swipeState) return
    const index = this.swipeState.index
    const current = this.data.recentRecords[index]
    const swipeX = current && current.swipeX < -SWIPE_OPEN_THRESHOLD ? -SWIPE_DELETE_WIDTH : 0
    this.setData({
      [`recentRecords[${index}].swipeX`]: swipeX
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

  openMarkerDetail(markerId) {
    const marker = this.data.markers.find((item) => item.id === markerId)
    const selected = marker ? this.data.sites.find((site) => site.id === marker.siteId) : null
    if (!selected || this.openingMarkerSiteId === selected.id) return

    this.openingMarkerSiteId = selected.id
    this.setData({
      selected,
      markers: this.buildMarkers(this.data.sites, selected.id)
    })
    wx.navigateTo({
      url: `/pages/site-detail/site-detail?id=${selected.id}`,
      complete: () => {
        setTimeout(() => {
          if (this.openingMarkerSiteId === selected.id) {
            this.openingMarkerSiteId = ''
          }
        }, 400)
      }
    })
  },

  onMarkerTap(evt) {
    this.openMarkerDetail(evt.detail.markerId)
  },

  switchRole(evt) {
    const role = evt.currentTarget.dataset.role
    storage.setRole(role)
    this.setData({
      role,
      roleText: roleMap[role],
      locationText: role === 'warden'
        ? '文保员巡检会记录今天的时间、点位和定位距离。'
        : '点击打卡时会读取当前位置，也可以手动确认记录。'
    })
    this.refresh()
  },

  recordVisit() {
    const site = this.data.selected
    if (!site) return
    wx.showLoading({ title: '定位中' })
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        wx.hideLoading()
        const meters = distanceMeters(res, site)
        this.saveVisit(site, meters, res)
      },
      fail: () => {
        wx.hideLoading()
        wx.showModal({
          title: '手动确认',
          content: '没有取得当前位置。是否仍然记录这次守护足迹？',
          confirmText: '记录',
          success: (res) => {
            if (res.confirm) this.saveVisit(site, 0, null)
          }
        })
      }
    })
  },

  chooseVisitPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        const originalPath = file ? (file.tempFilePath || file.path || '') : ''
        const photo = await persistSelectedPhoto(originalPath)
        this.setData({
          visitPhotoPath: photo.path,
          visitPhotoOriginalPath: photo.originalPath,
          visitPhotoPersisted: photo.persisted
        })
        if (photo.path && !photo.persisted) {
          wx.showToast({ title: '照片已选，可能无法长期保留', icon: 'none' })
        }
      }
    })
  },

  clearVisitPhoto() {
    this.setData({
      visitPhotoPath: '',
      visitPhotoOriginalPath: '',
      visitPhotoPersisted: false
    })
  },

  previewVisitPhoto() {
    if (!this.data.visitPhotoPath) return
    wx.previewImage({
      current: this.data.visitPhotoPath,
      urls: [this.data.visitPhotoPath]
    })
  },

  previewRecordPhoto(evt) {
    const path = evt.currentTarget.dataset.path
    if (!path) return
    wx.previewImage({
      current: path,
      urls: this.data.recentRecords.map((record) => record.photoPath).filter(Boolean)
    })
  },

  saveVisit(site, meters, location) {
    const role = this.data.role
    const kind = role === 'warden' ? 'patrol' : 'checkin'
    const inRange = meters > 0 && meters <= site.visitRadius
    const record = {
      id: `r_${Date.now()}`,
      siteId: site.id,
      siteName: site.name,
      kind,
      role,
      createdAt: Date.now(),
      date: localDateKey(),
      distanceMeters: meters,
      inRange,
      photoPath: this.data.visitPhotoPath,
      photoOriginalPath: this.data.visitPhotoOriginalPath,
      photoPersisted: this.data.visitPhotoPersisted,
      location: location ? { latitude: location.latitude, longitude: location.longitude } : null
    }
    storage.addRecord(record)
    reportSiteActivity(record)
      .then((remoteRecord) => {
        this.setData({
          remoteRecords: mergeRecords(this.data.remoteRecords, [remoteRecord])
        })
        this.refresh()
      })
      .catch((error) => {
        console.warn('sync visit record failed', error)
      })
    this.setData({
      locationText: meters
        ? `本次定位距离约 ${formatDistance(meters)}，${inRange ? '已在点位附近。' : '超出建议范围，已作为手动记录保存。'}`
        : '已保存为手动确认记录。',
      visitPhotoPath: '',
      visitPhotoOriginalPath: '',
      visitPhotoPersisted: false
    })
    wx.showToast({ title: kind === 'patrol' ? '巡检已记录' : '足迹已点亮', icon: 'success' })
    this.refresh()
  },

  goDetail() {
    if (!this.data.selected) return
    wx.navigateTo({
      url: `/pages/site-detail/site-detail?id=${this.data.selected.id}`
    })
  }
})
