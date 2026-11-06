const { requestGallery } = require('../../utils/gallery')

const filters = [
  { key: '', label: '全部' },
  { key: 'footprint', label: '实拍' },
  { key: 'creation', label: '文创' }
]

function formatDate(ts) {
  const date = new Date(ts)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: {
    filters,
    activeKind: '',
    items: [],
    loading: false
  },

  onLoad() {
    this.loadGallery()
  },

  onPullDownRefresh() {
    this.loadGallery().finally(() => wx.stopPullDownRefresh())
  },

  setFilter(evt) {
    this.setData({ activeKind: evt.currentTarget.dataset.kind || '' })
    this.loadGallery()
  },

  async loadGallery() {
    this.setData({ loading: true })
    try {
      const items = await requestGallery({ kind: this.data.activeKind, limit: 80 })
      this.setData({
        items: items.map((item) => ({
          ...item,
          timeText: formatDate(item.createdAt),
          badgeText: item.kind === 'creation' ? '文创' : '实拍'
        }))
      })
    } catch (error) {
      wx.showModal({
        title: '读取失败',
        content: error.message || '共享空间暂时无法打开。',
        showCancel: false
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  preview(evt) {
    const index = Number(evt.currentTarget.dataset.index)
    const current = this.data.items[index]
    if (!current) return
    wx.previewImage({
      current: current.imageUrl,
      urls: this.data.items.map((item) => item.imageUrl).filter(Boolean)
    })
  },

  goSite(evt) {
    const siteId = evt.currentTarget.dataset.siteId
    if (!siteId) return
    wx.navigateTo({ url: `/pages/site-detail/site-detail?id=${siteId}` })
  }
})
