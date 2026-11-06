const { getSites } = require('../../data/sites')
const storage = require('../../utils/storage')
const { requestGallery } = require('../../utils/gallery')
const { buildScoredSites } = require('../../utils/protection-score')

const sortModes = [
  { key: 'forgottenDesc', label: '最需要保护' },
  { key: 'popularDesc', label: '热门易访' },
  { key: 'forgottenAsc', label: '资料较完整' }
]

Page({
  data: {
    sortModes,
    activeSort: 'forgottenDesc',
    publicItems: [],
    sites: [],
    loading: false
  },

  onLoad() {
    this.refresh()
    this.loadPublicItems()
  },

  onShow() {
    this.refresh()
  },

  async loadPublicItems() {
    this.setData({ loading: true })
    try {
      const publicItems = await requestGallery({ limit: 100 })
      this.setData({ publicItems })
    } catch (error) {
      console.warn('load gallery for forgotten failed', error)
    } finally {
      this.setData({ loading: false })
      this.refresh()
    }
  },

  setSort(evt) {
    this.setData({ activeSort: evt.currentTarget.dataset.sort })
    this.refresh()
  },

  refresh() {
    const sites = buildScoredSites(getSites(), storage.getRecords(), this.data.publicItems)
      .map((site) => ({
        ...site,
        reasonsText: site.protectionScore.reasons.join(' / '),
        priorityText: `优先级 ${site.protectionScore.priority}`,
        primaryMetric: site.protectionScore.metrics.find((metric) => metric.key === 'risk'),
        secondaryMetric: site.protectionScore.metrics.find((metric) => metric.key === 'patrolFrequency')
      }))

    const activeSort = this.data.activeSort
    sites.sort((a, b) => {
      if (activeSort === 'popularDesc') {
        return b.protectionScore.popularIndex - a.protectionScore.popularIndex
      }
      if (activeSort === 'forgottenAsc') {
        return a.protectionScore.forgottenIndex - b.protectionScore.forgottenIndex
      }
      return b.protectionScore.forgottenIndex - a.protectionScore.forgottenIndex
    })
    this.setData({ sites })
  },

  goDetail(evt) {
    wx.navigateTo({ url: `/pages/site-detail/site-detail?id=${evt.currentTarget.dataset.id}` })
  },

  goFootprint(evt) {
    const siteId = evt.currentTarget.dataset.id
    if (!siteId) return
    storage.setFocusSite(siteId)
    wx.switchTab({ url: '/pages/footprint/footprint' })
  }
})
