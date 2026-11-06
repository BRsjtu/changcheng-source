const { getSites, getTypeLabels } = require('../../data/sites')
const storage = require('../../utils/storage')
const { requestGallery } = require('../../utils/gallery')
const { downloadImageForDisplay } = require('../../utils/image-display')
const { buildScoredSites } = require('../../utils/protection-score')

Page({
  data: {
    filters: [],
    activeFilter: 'all',
    sites: [],
    filteredSites: [],
    publicItems: []
  },

  onLoad() {
    this.coverCache = {}
    this.coverLoading = {}
    const typeLabels = getTypeLabels()
    const filters = Object.keys(typeLabels).map((key) => ({
      key,
      label: typeLabels[key]
    }))
    const sites = this.decorateSites(getSites(), [])
    this.setData({ filters, sites })
    this.applyFilter()
    this.loadPublicItems()
  },

  onShow() {
    this.refreshScores()
  },

  decorateSites(sites, publicItems) {
    const scoredSites = buildScoredSites(sites, storage.getRecords(), publicItems)
    return scoredSites.map((site) => ({
      ...site,
      imageDisplayPath: (this.coverCache && this.coverCache[site.id]) || site.imagePath,
      tagsText: site.tags.join(' / '),
      priorityText: `保护优先级：${site.protectionScore.priority}`,
      priorityClass: site.protectionScore.priorityClass
    }))
  },

  async loadPublicItems() {
    try {
      const publicItems = await requestGallery({ limit: 100 })
      this.setData({ publicItems })
      this.refreshScores()
    } catch (error) {
      console.warn('load gallery for journal failed', error)
    }
  },

  refreshScores() {
    const sites = this.decorateSites(getSites(), this.data.publicItems)
    this.setData({ sites })
    this.applyFilter()
    this.localizeCoverImages(sites)
  },

  localizeCoverImages(sites) {
    sites.forEach((site) => {
      if (!site.imagePath || !/^https?:\/\//i.test(site.imagePath)) return
      if (this.coverCache[site.id] || this.coverLoading[site.id]) return
      this.coverLoading[site.id] = true
      downloadImageForDisplay(site.imagePath)
        .then((localPath) => {
          if (!localPath || localPath === site.imagePath) return
          this.coverCache[site.id] = localPath
          this.updateCoverImage(site.id, localPath)
        })
        .catch((error) => {
          console.warn('download site cover failed', site.id, error)
        })
        .finally(() => {
          delete this.coverLoading[site.id]
        })
    })
  },

  updateCoverImage(siteId, localPath) {
    const patch = {}
    const siteIndex = this.data.sites.findIndex((site) => site.id === siteId)
    if (siteIndex >= 0) {
      patch[`sites[${siteIndex}].imageDisplayPath`] = localPath
    }
    const filteredIndex = this.data.filteredSites.findIndex((site) => site.id === siteId)
    if (filteredIndex >= 0) {
      patch[`filteredSites[${filteredIndex}].imageDisplayPath`] = localPath
    }
    if (Object.keys(patch).length) {
      this.setData(patch)
    }
  },

  setFilter(evt) {
    this.setData({
      activeFilter: evt.currentTarget.dataset.key
    })
    this.applyFilter()
  },

  applyFilter() {
    const { activeFilter, sites } = this.data
    const filteredSites = activeFilter === 'all'
      ? sites
      : sites.filter((site) => site.type === activeFilter)
    this.setData({ filteredSites })
  },

  goDetail(evt) {
    wx.navigateTo({
      url: `/pages/site-detail/site-detail?id=${evt.currentTarget.dataset.id}`
    })
  },

  goForgotten() {
    wx.navigateTo({ url: '/pages/forgotten/forgotten' })
  }
})
