function getAiBaseUrl() {
  return 'http://127.0.0.1:3010/ai'
}

App({
  globalData: {
    aiBaseUrl: getAiBaseUrl(),
    aiImageModel: 'gpt-image-2.5-flare',
    aiImageQuality: 'medium',
    aiChatModel: 'gpt-5.6-luna',
    mapCenter: {
      latitude: 39.0475,
      longitude: 111.0678
    },
    projectName: '墩台志'
  }
})
